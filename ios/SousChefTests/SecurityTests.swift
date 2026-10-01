import Foundation
import Network
import Testing
import UIKit
@testable import SousChef

/// Regression tests for the 2026-09-30 security audit (SC-01 to SC-03). They
/// run real URLSession traffic against loopback servers with dummy tokens.
@MainActor
@Suite(.serialized)
struct SecurityTests {
    static let token = "AUDIT_DUMMY_TOKEN"

    // MARK: SC-01 — the session only goes to the kitchen

    @Test func comparesOriginsBySchemeHostAndPort() throws {
        func same(_ a: String, _ b: String) -> Bool { BoundedFetch.sameOrigin(URL(string: a)!, URL(string: b)!) }
        #expect(same("http://Kitchen.local:3000/api", "http://kitchen.local:3000/files/1"))
        #expect(same("https://kitchen.example.com/", "https://kitchen.example.com:443/x"))
        #expect(same("http://kitchen.example.com./", "http://kitchen.example.com/x"))
        #expect(!same("http://kitchen.example.com/", "https://kitchen.example.com/"))
        #expect(!same("http://kitchen.example.com:3000/", "http://kitchen.example.com:3001/"))
        #expect(!same("http://kitchen.example.com/", "http://kitchen.example.com.evil.test/"))
        #expect(!same("http://kitchen.example.com/", "ftp://kitchen.example.com/"))
    }

    @Test func sendsSessionToKitchenPhotos() async throws {
        let kitchen = try await TestHTTPServer { _ in .ok(Data("photo".utf8)) }
        defer { kitchen.stop() }
        let client = ServerClient(baseURL: kitchen.url, token: Self.token)
        let data = try await client.download("/api/files/abc")
        #expect(data == Data("photo".utf8))
        #expect(kitchen.requests.first?.headers["cookie"] == "sous_chef_session=\(Self.token)")
    }

    @Test func keepsSessionFromOtherPhotoOrigins() async throws {
        let kitchen = try await TestHTTPServer { _ in .ok(Data("kitchen".utf8)) }
        let collector = try await TestHTTPServer { _ in .ok(Data("external".utf8)) }
        defer { kitchen.stop(); collector.stop() }
        let client = ServerClient(baseURL: kitchen.url, token: Self.token)
        let port = collector.port
        // Absolute, protocol-relative, and same host on another port.
        for path in ["http://127.0.0.1:\(port)/a.jpg", "//127.0.0.1:\(port)/b.jpg", "http://localhost:\(port)/c.jpg"] {
            #expect(try await client.download(path) == Data("external".utf8))
        }
        #expect(collector.requests.count == 3)
        for request in collector.requests {
            #expect(request.headers["cookie"] == nil)
            #expect(request.headers["authorization"] == nil)
        }
        #expect(kitchen.requests.isEmpty)
    }

    @Test func refusesRedirectsOffTheKitchen() async throws {
        let collector = try await TestHTTPServer { _ in .ok(Data("stolen".utf8)) }
        let target = collector.url.appending(path: "collect").absoluteString
        let kitchen = try await TestHTTPServer { _ in .redirect(target) }
        defer { kitchen.stop(); collector.stop() }
        let client = ServerClient(baseURL: kitchen.url, token: Self.token)
        await #expect(throws: ServerClient.ServerError.self) { try await client.download("/api/files/abc") }
        await #expect(throws: ServerClient.ServerError.self) { try await client.call("recipes:list") }
        await #expect(throws: ServerClient.ServerError.self) { try await client.status() }
        #expect(collector.requests.isEmpty)
        #expect(kitchen.requests.count == 3)
    }

    @Test func followsSameOriginRedirectsWithSession() async throws {
        let kitchen = try await TestHTTPServer { request in
            request.path == "/old" ? .redirect("/api/files/new") : .ok(Data("moved".utf8))
        }
        defer { kitchen.stop() }
        let client = ServerClient(baseURL: kitchen.url, token: Self.token)
        #expect(try await client.download("/old") == Data("moved".utf8))
        #expect(kitchen.requests.map(\.path) == ["/old", "/api/files/new"])
        #expect(kitchen.requests.allSatisfy { $0.headers["cookie"] == "sous_chef_session=\(Self.token)" })
    }

    @Test func externalPhotoRedirectsStayCredentialFree() async throws {
        let final = try await TestHTTPServer { _ in .ok(Data("final".utf8)) }
        let finalURL = final.url.appending(path: "img.jpg").absoluteString
        let hop = try await TestHTTPServer { _ in .redirect(finalURL) }
        let kitchen = try await TestHTTPServer { _ in .ok(Data()) }
        defer { final.stop(); hop.stop(); kitchen.stop() }
        let client = ServerClient(baseURL: kitchen.url, token: Self.token)
        #expect(try await client.download(hop.url.appending(path: "start.jpg").absoluteString) == Data("final".utf8))
        #expect((hop.requests + final.requests).allSatisfy { $0.headers["cookie"] == nil && $0.headers["authorization"] == nil })
        #expect(kitchen.requests.isEmpty)
    }

    // MARK: SC-02 — plain HTTP to public servers needs confirmation

    @Test func classifiesPlainHTTPDestinations() throws {
        func insecure(_ address: String) throws -> Bool { ServerClient.isInsecureRemote(try ServerClient.normalize(address)) }
        // HTTPS is always fine.
        #expect(try !insecure("https://kitchen.example.com"))
        #expect(try !insecure("https://[2606:4700:4700::1111]"))
        // Home network, loopback, link-local and tailnet stay quiet.
        for local in ["192.168.1.20:3000", "http://10.0.0.5", "http://172.16.0.1", "http://172.31.255.255", "http://127.0.0.1:3000",
                      "http://169.254.10.1", "http://100.101.102.103", "http://localhost:3000", "http://kitchen.local", "http://nas.lan",
                      "http://pi.home.arpa", "http://nas.tail1234.ts.net", "http://nas", "http://[::1]:3000", "http://[fe80::1]",
                      "http://[fd12:3456:789a::1]:3000", "http://[::ffff:192.168.1.20]", "http://kitchen.local."] {
            #expect(try !insecure(local), "\(local) should be treated as local")
        }
        // Public or ambiguous destinations need confirmation.
        for remote in ["http://kitchen.example.com", "http://kitchen.example.com.", "http://8.8.8.8", "http://172.32.0.1",
                       "http://[2606:4700:4700::1111]", "http://[2001:db8::1]:3000", "http://[::ffff:8.8.8.8]",
                       "http://3232235777", "http://0x7f000001", "http://127.1", "http://0177.0.0.1", "http://0.0.0.0", "http://999.1.1.1"] {
            #expect(try insecure(remote), "\(remote) should need confirmation")
        }
    }

    @Test func refusesUnconfirmedPublicHTTPBeforeConnecting() async throws {
        // 203.0.113.0/24 is reserved for documentation; nothing is contacted.
        let url = try ServerClient.normalize("http://203.0.113.10:3000")
        let client = ServerClient(baseURL: url, token: Self.token)
        await #expect(throws: ServerClient.ServerError.insecureConnection) { try await client.status() }
        await #expect(throws: ServerClient.ServerError.insecureConnection) { try await client.call("recipes:list") }
        await #expect(throws: ServerClient.ServerError.insecureConnection) { try await client.download("/api/files/1") }
        await #expect(throws: ServerClient.ServerError.insecureConnection) {
            try await client.authenticate(flow: "signIn", email: "cook@example.com", password: "password123")
        }
    }

    @Test func confirmedLocalServersStillConnect() async throws {
        let kitchen = try await TestHTTPServer { _ in .ok(Data(#"{"authenticated":false}"#.utf8)) }
        defer { kitchen.stop() }
        let status = try await ServerClient(baseURL: kitchen.url, token: nil).status()
        #expect(status.authenticated == false)
    }

    // MARK: SC-03 — downloads stop at their budget

    @Test func stopsChunkedResponsesAtTheBudget() async throws {
        let chunk = Data(repeating: 0x61, count: 64 * 1024)
        let server = try await TestHTTPServer { _ in .chunked(chunk, count: 800) } // 50 MB if fully sent
        defer { server.stop() }
        await #expect(throws: BoundedFetch.FetchError.tooLarge) {
            try await BoundedFetch.data(for: URLRequest(url: server.url), limit: 1_000_000, redirects: .anyCredentialFree)
        }
        try await Task.sleep(for: .milliseconds(200))
        #expect(server.bodyBytesSent < 25_000_000, "sent \(server.bodyBytesSent) bytes")
    }

    @Test func rejectsDeclaredOversizedResponses() async throws {
        let server = try await TestHTTPServer { _ in .declared(length: 9_000_000, sending: Data(repeating: 0, count: 1024)) }
        defer { server.stop() }
        await #expect(throws: BoundedFetch.FetchError.tooLarge) {
            try await BoundedFetch.data(for: URLRequest(url: server.url), limit: 8_000_000, redirects: .anyCredentialFree)
        }
    }

    @Test func countsDecompressedBytes() async throws {
        let raw = Data(repeating: 0, count: 20_000_000)
        let deflated = try (raw as NSData).compressed(using: .zlib) as Data
        #expect(deflated.count < 1_000_000)
        let server = try await TestHTTPServer { _ in .ok(deflated, headers: ["Content-Encoding": "deflate"]) }
        defer { server.stop() }
        await #expect(throws: BoundedFetch.FetchError.tooLarge) {
            try await BoundedFetch.data(for: URLRequest(url: server.url), limit: 4_000_000, redirects: .anyCredentialFree)
        }
    }

    @Test func truncatesPagesAtTheBudget() async throws {
        let chunk = Data(repeating: 0x62, count: 64 * 1024)
        let server = try await TestHTTPServer { _ in .chunked(chunk, count: 200) }
        defer { server.stop() }
        let (data, response) = try await BoundedFetch.data(for: URLRequest(url: server.url), limit: 1_000_000, overflow: .truncate, redirects: .anyCredentialFree)
        #expect(response.statusCode == 200)
        #expect(data.count == 1_000_000)
    }

    @Test func importsOrdinaryPagesAndImages() async throws {
        let photo = Self.jpeg(width: 3000, height: 2000)
        var server: TestHTTPServer!
        server = try await TestHTTPServer { request in
            if request.path == "/photo.jpg" { return .ok(photo, headers: ["Content-Type": "image/jpeg"]) }
            let page = """
            <html><head><script type="application/ld+json">{"@type":"Recipe","name":"Toast","image":"/photo.jpg",
            "recipeIngredient":["2 slices bread"],"recipeInstructions":["Toast the bread."]}</script></head></html>
            """
            return .ok(Data(page.utf8), headers: ["Content-Type": "text/html"])
        }
        defer { server.stop() }
        let draft = try await RecipeImporter.importRecipe(from: server.url.appending(path: "toast").absoluteString, ai: KitchenAI())
        #expect(draft.title == "Toast")
        let size = try #require(draft.photo.flatMap(ImageTools.pixelSize))
        #expect(max(size.width, size.height) == 1600)
        #expect(server.requests.allSatisfy { $0.headers["cookie"] == nil })
    }

    @Test func refusesImagesWithHugeDimensionsBeforeDecoding() throws {
        // A tiny file declaring a 60,000 × 60,000 image.
        let bomb = Self.png(width: 60_000, height: 60_000)
        #expect(bomb.count < 100)
        #expect(ImageTools.compressed(bomb) == nil)
        #expect(ImageTools.fitted(bomb) == nil)
        #expect(ImageTools.fitted(Data("not an image".utf8)) == nil)

        // The pixel budget is checked from the header, before decoding.
        let photo = Self.jpeg(width: 3000, height: 2000)
        #expect(ImageTools.pixelSize(photo) == CGSize(width: 3000, height: 2000))
        #expect(ImageTools.compressed(photo, maxPixels: 5_000_000) == nil)
        #expect(ImageTools.fitted(photo, maxPixels: 5_000_000) == nil)
        #expect(ImageTools.compressed(photo, maxPixels: 6_000_000).flatMap(ImageTools.pixelSize) == CGSize(width: 1600, height: 1067))
        // Small synced photos are kept byte for byte.
        let small = Self.jpeg(width: 800, height: 600)
        #expect(ImageTools.fitted(small) == small)
    }

    static func jpeg(width: CGFloat, height: CGFloat) -> Data {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).jpegData(withCompressionQuality: 0.5) { context in
            UIColor.orange.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    /// A PNG header declaring the given size, with a token image body.
    static func png(width: UInt32, height: UInt32) -> Data {
        func chunk(_ type: String, _ body: Data) -> Data {
            var out = Data()
            out.append(contentsOf: withUnsafeBytes(of: UInt32(body.count).bigEndian, Array.init))
            let typed = Data(type.utf8) + body
            out.append(typed)
            out.append(contentsOf: withUnsafeBytes(of: crc32(typed).bigEndian, Array.init))
            return out
        }
        var header = Data()
        header.append(contentsOf: withUnsafeBytes(of: width.bigEndian, Array.init))
        header.append(contentsOf: withUnsafeBytes(of: height.bigEndian, Array.init))
        header.append(contentsOf: [8, 2, 0, 0, 0])
        return Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) + chunk("IHDR", header)
            + chunk("IDAT", Data([0x78, 0x9C, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01])) + chunk("IEND", Data())
    }

    static func crc32(_ data: Data) -> UInt32 {
        var crc: UInt32 = 0xFFFF_FFFF
        for byte in data {
            crc ^= UInt32(byte)
            for _ in 0..<8 { crc = (crc >> 1) ^ (0xEDB8_8320 & (0 &- (crc & 1))) }
        }
        return ~crc
    }
}

/// A tiny HTTP/1.1 server on 127.0.0.1 that records what it receives.
nonisolated final class TestHTTPServer: @unchecked Sendable {
    struct Request: Sendable {
        let method: String
        let path: String
        /// Lowercased header names.
        let headers: [String: String]
    }

    enum Reply: Sendable {
        case ok(Data, headers: [String: String] = [:])
        case redirect(String)
        /// Sends `chunk` `count` times with chunked transfer encoding.
        case chunked(Data, count: Int)
        /// Declares a Content-Length but sends only `sending`.
        case declared(length: Int, sending: Data)
    }

    private let listener: NWListener
    private let queue = DispatchQueue(label: "TestHTTPServer")
    private let handler: @Sendable (Request) -> Reply
    private let lock = NSLock()
    private var received: [Request] = []
    private var sent = 0

    var requests: [Request] { lock.withLock { received } }
    var bodyBytesSent: Int { lock.withLock { sent } }
    var port: UInt16 { listener.port?.rawValue ?? 0 }
    var url: URL { URL(string: "http://127.0.0.1:\(port)")! }

    init(handler: @escaping @Sendable (Request) -> Reply) async throws {
        self.handler = handler
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        listener = try NWListener(using: parameters)
        listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let once = Once()
            listener.stateUpdateHandler = { state in
                switch state {
                case .ready: once.run { continuation.resume() }
                case .failed(let error): once.run { continuation.resume(throwing: error) }
                default: break
                }
            }
            listener.start(queue: queue)
        }
    }

    func stop() { listener.cancel() }

    private func accept(_ connection: NWConnection) {
        connection.start(queue: queue)
        read(connection, buffer: Data())
    }

    private func read(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, done, error in
            guard let self else { return }
            var buffer = buffer
            if let data { buffer.append(data) }
            if let end = buffer.range(of: Data("\r\n\r\n".utf8)) {
                let request = Self.parse(buffer[..<end.lowerBound])
                lock.withLock { received.append(request) }
                respond(handler(request), on: connection)
            } else if error == nil && !done {
                read(connection, buffer: buffer)
            } else {
                connection.cancel()
            }
        }
    }

    private static func parse(_ head: Data) -> Request {
        let lines = String(decoding: head, as: UTF8.self).components(separatedBy: "\r\n")
        let first = lines.first?.split(separator: " ") ?? []
        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { continue }
            headers[line[..<colon].lowercased()] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }
        return Request(method: first.first.map(String.init) ?? "", path: first.dropFirst().first.map(String.init) ?? "", headers: headers)
    }

    private func respond(_ reply: Reply, on connection: NWConnection) {
        func head(_ status: String, _ headers: [String: String]) -> Data {
            var text = "HTTP/1.1 \(status)\r\nConnection: close\r\n"
            for (name, value) in headers { text += "\(name): \(value)\r\n" }
            return Data((text + "\r\n").utf8)
        }
        switch reply {
        case .ok(let body, let headers):
            var all = headers
            all["Content-Length"] = String(body.count)
            send(head("200 OK", all) + body, counting: body.count, on: connection) { connection.cancel() }
        case .redirect(let location):
            send(head("302 Found", ["Location": location, "Content-Length": "0"]), counting: 0, on: connection) { connection.cancel() }
        case .declared(let length, let body):
            send(head("200 OK", ["Content-Length": String(length)]) + body, counting: body.count, on: connection) {}
        case .chunked(let chunk, let count):
            let framed = Data(String(chunk.count, radix: 16).utf8) + Data("\r\n".utf8) + chunk + Data("\r\n".utf8)
            func next(_ remaining: Int) {
                guard remaining > 0 else {
                    return send(Data("0\r\n\r\n".utf8), counting: 0, on: connection) { connection.cancel() }
                }
                send(framed, counting: chunk.count, on: connection) { next(remaining - 1) }
            }
            send(head("200 OK", ["Transfer-Encoding": "chunked"]), counting: 0, on: connection) { next(count) }
        }
    }

    private func send(_ data: Data, counting body: Int, on connection: NWConnection, then: @escaping () -> Void) {
        connection.send(content: data, completion: .contentProcessed { [weak self] error in
            guard let self, error == nil else { return connection.cancel() }
            lock.withLock { sent += body }
            then()
        })
    }
}

nonisolated private final class Once: @unchecked Sendable {
    private let lock = NSLock()
    private var done = false
    func run(_ body: () -> Void) {
        let first = lock.withLock { () -> Bool in
            defer { done = true }
            return !done
        }
        if first { body() }
    }
}
