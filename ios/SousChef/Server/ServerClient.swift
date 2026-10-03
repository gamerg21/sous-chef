import Foundation
import Security

/// Talks to a self-hosted Sous Chef server through the same JSON API the web
/// app uses: `POST /api/auth` for sessions and `POST /api/kitchen` for typed
/// operations such as `inventory:list`.
final class ServerClient {
    enum ServerError: LocalizedError, Equatable {
        case invalidURL, notAuthenticated, server(String), unreachable, badResponse, insecureConnection
        var errorDescription: String? {
            switch self {
            case .invalidURL: "Enter your server's address, like http://192.168.1.20:3000"
            case .notAuthenticated: "Your server session ended. Sign in again."
            case .server(let message): message
            case .unreachable: "Couldn't reach your Sous Chef server. Check the address and that you're on the same network."
            case .badResponse: "That address didn't answer like a Sous Chef server."
            case .insecureConnection: "This server uses plain HTTP outside your home network. Connect again in Settings to confirm you want to use it without encryption."
            }
        }
    }

    static let cookieName = "sous_chef_session"
    /// Kitchen API responses can be large for big kitchens; photos are capped
    /// well above the server's 5 MB upload limit.
    static let responseLimit = 64_000_000
    static let photoLimit = 10_000_000

    let baseURL: URL
    private(set) var token: String?
    /// Whether the person confirmed sending credentials to a plain-HTTP
    /// server outside their home network.
    let allowsInsecure: Bool
    private let session: URLSession

    init(baseURL: URL, token: String?, allowsInsecure: Bool = false) {
        self.baseURL = baseURL
        self.token = token
        self.allowsInsecure = allowsInsecure
        session = URLSession(configuration: BoundedFetch.anonymousConfiguration)
    }

    static func normalize(_ address: String) throws -> URL {
        var text = address.trimmingCharacters(in: .whitespacesAndNewlines)
        while text.hasSuffix("/") { text.removeLast() }
        if !text.lowercased().hasPrefix("http://") && !text.lowercased().hasPrefix("https://") { text = "http://" + text }
        guard let url = URL(string: text), url.host?.isEmpty == false, url.user == nil else { throw ServerError.invalidURL }
        return url
    }

    /// True when credentials could cross the internet unencrypted. HTTPS is
    /// always fine. Plain HTTP is fine only for loopback, private and
    /// link-local addresses, tailnet addresses, and home-network names;
    /// anything public or ambiguous needs the person's confirmation.
    static func isInsecureRemote(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(), scheme != "https" else { return false }
        guard scheme == "http", var host = url.host(percentEncoded: false)?.lowercased(), !host.isEmpty else { return true }
        if host.hasPrefix("[") && host.hasSuffix("]") { host = String(host.dropFirst().dropLast()) }
        while host.hasSuffix(".") { host.removeLast() }
        // Numeric addresses are classified by value, before any name rules,
        // so IPv6 literals and shorthand IPv4 can't pass as local names.
        if let v4 = ipv4(host) { return !isLocalIPv4(v4) }
        if let v6 = ipv6(host) { return !isLocalIPv6(v6) }
        // Anything else that is numeric (3232235777, 0x7f.1, 127.1) or
        // colon-separated is an address the system may still connect to.
        if host.contains(":") || host.range(of: #"^((0x[0-9a-f]*|[0-9]+)\.){0,3}(0x[0-9a-f]*|[0-9]+)$"#, options: .regularExpression) != nil { return true }
        if host == "localhost" || host.hasSuffix(".localhost") { return false }
        if [".local", ".lan", ".home.arpa", ".internal", ".ts.net"].contains(where: host.hasSuffix) { return false }
        // Single-label names like "nas" only resolve on the local network.
        return host.contains(".")
    }

    /// Strict dotted-quad IPv4 only; shorthand like "127.1" returns nil.
    static func ipv4(_ host: String) -> [UInt8]? {
        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4 else { return nil }
        let bytes = parts.compactMap { part -> UInt8? in
            guard (1...3).contains(part.count), part.allSatisfy(\.isASCII), part.allSatisfy(\.isNumber), part == "0" || !part.hasPrefix("0") else { return nil }
            return UInt8(part)
        }
        return bytes.count == 4 ? bytes : nil
    }

    static func ipv6(_ host: String) -> [UInt8]? {
        guard host.contains(":") else { return nil }
        // Zone IDs (fe80::1%en0) only make sense on the local link.
        let address = host.split(separator: "%", maxSplits: 1).first.map(String.init) ?? host
        var storage = in6_addr()
        guard inet_pton(AF_INET6, address, &storage) == 1 else { return nil }
        return withUnsafeBytes(of: storage) { Array($0) }
    }

    private static func isLocalIPv4(_ b: [UInt8]) -> Bool {
        b[0] == 10 || b[0] == 127 || (b[0] == 192 && b[1] == 168) || (b[0] == 172 && (16...31).contains(b[1]))
            || (b[0] == 169 && b[1] == 254) || (b[0] == 100 && (64...127).contains(b[1]))
    }

    private static func isLocalIPv6(_ b: [UInt8]) -> Bool {
        if b == [UInt8](repeating: 0, count: 15) + [1] { return true }                     // ::1
        if b[0] == 0xfe && (b[1] & 0xc0) == 0x80 { return true }                           // fe80::/10 link-local
        if (b[0] & 0xfe) == 0xfc { return true }                                           // fc00::/7 unique local
        if b[0..<10].allSatisfy({ $0 == 0 }) && b[10] == 0xff && b[11] == 0xff { return isLocalIPv4(Array(b[12...])) } // ::ffff:a.b.c.d
        return false
    }

    /// Only the kitchen itself — same scheme, host and port — gets the session.
    func isKitchenOrigin(_ url: URL) -> Bool {
        BoundedFetch.sameOrigin(url, baseURL)
    }

    private func request(_ path: String, method: String = "POST", body: Data? = nil, contentType: String = "application/json") -> URLRequest {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.httpBody = body
        if body != nil { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("SousChef-iOS/\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1")", forHTTPHeaderField: "User-Agent")
        if let token { request.setValue("\(Self.cookieName)=\(token)", forHTTPHeaderField: "Cookie") }
        return request
    }

    /// Every request carrying the session goes through here: it refuses an
    /// unconfirmed plain-HTTP public server and any redirect off the kitchen.
    private func send(_ request: URLRequest, limit: Int = responseLimit) async throws -> (Data, HTTPURLResponse) {
        guard let url = request.url, isKitchenOrigin(url) else { throw ServerError.badResponse }
        guard allowsInsecure || !Self.isInsecureRemote(baseURL) else { throw ServerError.insecureConnection }
        do {
            return try await BoundedFetch.data(for: request, limit: limit, redirects: .sameOriginOnly, session: session)
        } catch let error as BoundedFetch.FetchError where error != .notHTTP {
            throw ServerError.badResponse
        } catch {
            throw ServerError.unreachable
        }
    }

    private func errorMessage(_ data: Data) -> String? {
        (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
    }

    // MARK: Auth

    struct AuthStatus: Decodable { let authenticated: Bool; let demo: Bool? }

    func status() async throws -> AuthStatus {
        let (data, response) = try await send(request("api/auth", method: "GET"))
        guard response.statusCode == 200, let status = try? JSONDecoder().decode(AuthStatus.self, from: data) else { throw ServerError.badResponse }
        return status
    }

    /// Signs in (or creates the account) and keeps the session token.
    func authenticate(flow: String, email: String, password: String, name: String? = nil) async throws {
        var body: [String: Any] = ["flow": flow, "email": email, "password": password]
        if let name { body["name"] = name }
        let (data, response) = try await send(request("api/auth", body: try JSONSerialization.data(withJSONObject: body)))
        guard response.statusCode == 200 else { throw ServerError.server(errorMessage(data) ?? "Sign-in failed") }
        let header = response.value(forHTTPHeaderField: "Set-Cookie") ?? ""
        let cookies = HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie": header], for: baseURL)
        guard let value = cookies.first(where: { $0.name == Self.cookieName })?.value ?? Self.cookieValue(in: header) else {
            throw ServerError.server("The server didn't start a session. Check the address.")
        }
        token = value
    }

    static func cookieValue(in header: String) -> String? {
        guard let range = header.range(of: "\(cookieName)=") else { return nil }
        let value = header[range.upperBound...].prefix { $0 != ";" && $0 != "," }
        return value.isEmpty ? nil : String(value)
    }

    func signOut() async {
        _ = try? await send(request("api/auth", body: try JSONSerialization.data(withJSONObject: ["flow": "signOut"])))
        token = nil
    }

    // MARK: Kitchen operations

    /// Calls a typed kitchen operation. `args` may contain `NSNull()` to clear fields.
    func call(_ path: String, _ args: [String: Any] = [:]) async throws -> Any {
        guard token != nil else { throw ServerError.notAuthenticated }
        let body = try JSONSerialization.data(withJSONObject: ["path": path, "args": args])
        let (data, response) = try await send(request("api/kitchen", body: body))
        if response.statusCode == 401 { throw ServerError.notAuthenticated }
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw ServerError.badResponse }
        guard response.statusCode == 200 else { throw ServerError.server(json["error"] as? String ?? "Your kitchen could not complete this request") }
        return json["value"] ?? NSNull()
    }

    func call<T: Decodable>(_ path: String, _ args: [String: Any] = [:], as type: T.Type) async throws -> T {
        let value = try await call(path, args)
        let data = try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed])
        do { return try JSONDecoder().decode(T.self, from: data) } catch { throw ServerError.badResponse }
    }

    // MARK: Files

    func uploadPhoto(_ jpeg: Data) async throws -> String {
        guard token != nil else { throw ServerError.notAuthenticated }
        var request = request("api/files", body: jpeg, contentType: "image/jpeg")
        // The upload route checks the origin; send the server's own.
        var origin = "\(baseURL.scheme ?? "http")://\(baseURL.host ?? "")"
        if let port = baseURL.port { origin += ":\(port)" }
        request.setValue(origin, forHTTPHeaderField: "Origin")
        let (data, response) = try await send(request)
        guard response.statusCode == 200,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = json["storageId"] as? String else { throw ServerError.server(errorMessage(data) ?? "Photo upload failed") }
        return "/api/files/\(id)"
    }

    /// Downloads a recipe photo. Paths on the kitchen get the session; any
    /// other address — absolute, protocol-relative or a different port — is
    /// fetched anonymously, since recipe photo links come from other people.
    func download(_ path: String) async throws -> Data {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL, BoundedFetch.Origin(url) != nil else { throw ServerError.badResponse }
        let data: Data
        let response: HTTPURLResponse
        if isKitchenOrigin(url) {
            var request = URLRequest(url: url)
            if let token { request.setValue("\(Self.cookieName)=\(token)", forHTTPHeaderField: "Cookie") }
            (data, response) = try await send(request, limit: Self.photoLimit)
        } else {
            do {
                (data, response) = try await BoundedFetch.data(for: URLRequest(url: url), limit: Self.photoLimit, redirects: .anyCredentialFree)
            } catch {
                throw ServerError.badResponse
            }
        }
        guard response.statusCode == 200 else { throw ServerError.badResponse }
        return data
    }
}

enum Keychain {
    private static let service = "io.souschef.server"

    static func save(_ value: String, account: String) {
        delete(account: account)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account,
                                    kSecValueData as String: Data(value.utf8), kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        SecItemAdd(query as CFDictionary, nil)
    }

    static func read(account: String) -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account,
                                    kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(account: String) {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        SecItemDelete(query as CFDictionary)
    }
}
