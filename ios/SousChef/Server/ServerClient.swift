import Foundation
import Security

/// Talks to a self-hosted Sous Chef server through the same JSON API the web
/// app uses: `POST /api/auth` for sessions and `POST /api/kitchen` for typed
/// operations such as `inventory:list`.
final class ServerClient {
    enum ServerError: LocalizedError {
        case invalidURL, notAuthenticated, server(String), unreachable, badResponse
        var errorDescription: String? {
            switch self {
            case .invalidURL: "Enter your server's address, like http://192.168.1.20:3000"
            case .notAuthenticated: "Your server session ended. Sign in again."
            case .server(let message): message
            case .unreachable: "Couldn't reach your Sous Chef server. Check the address and that you're on the same network."
            case .badResponse: "That address didn't answer like a Sous Chef server."
            }
        }
    }

    static let cookieName = "sous_chef_session"

    let baseURL: URL
    private(set) var token: String?
    private let session: URLSession

    init(baseURL: URL, token: String?) {
        self.baseURL = baseURL
        self.token = token
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = 20
        configuration.waitsForConnectivity = false
        session = URLSession(configuration: configuration)
    }

    static func normalize(_ address: String) throws -> URL {
        var text = address.trimmingCharacters(in: .whitespacesAndNewlines)
        while text.hasSuffix("/") { text.removeLast() }
        if !text.lowercased().hasPrefix("http://") && !text.lowercased().hasPrefix("https://") { text = "http://" + text }
        guard let url = URL(string: text), url.host?.isEmpty == false, url.user == nil else { throw ServerError.invalidURL }
        return url
    }

    /// True when credentials would cross the internet unencrypted.
    static func isInsecureRemote(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "http", let host = url.host?.lowercased() else { return false }
        if host == "localhost" || host.hasSuffix(".local") || host.hasSuffix(".lan") || host.hasSuffix(".home.arpa") || host.hasSuffix(".ts.net") || !host.contains(".") { return false }
        let parts = host.split(separator: ".").compactMap { Int($0) }
        if parts.count == 4 {
            if parts[0] == 10 || parts[0] == 127 || (parts[0] == 192 && parts[1] == 168) || (parts[0] == 172 && (16...31).contains(parts[1])) || (parts[0] == 100 && (64...127).contains(parts[1])) { return false }
        }
        return true
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

    private func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw ServerError.badResponse }
            return (data, http)
        } catch let error as ServerError {
            throw error
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

    func download(_ path: String) async throws -> Data {
        let url = path.hasPrefix("http") ? URL(string: path) : URL(string: path, relativeTo: baseURL)
        guard let url else { throw ServerError.badResponse }
        var request = URLRequest(url: url.absoluteURL)
        if let token { request.setValue("\(Self.cookieName)=\(token)", forHTTPHeaderField: "Cookie") }
        let (data, response) = try await send(request)
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
