import AuthenticationServices
import CryptoKit
import Foundation
import Observation
import Security

/// Nonces for Sign in with Apple: the request carries SHA-256(raw) and the
/// community server checks the identity token's nonce against the raw value.
enum AppleNonce {
    // 64 symbols, so a random byte maps without modulo bias.
    private static let alphabet = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_")

    static func random(length: Int = 32) -> String {
        var bytes = [UInt8](repeating: 0, count: length)
        if SecRandomCopyBytes(kSecRandomDefault, length, &bytes) != errSecSuccess {
            bytes = (0..<length).map { _ in UInt8.random(in: 0...255) }
        }
        return String(bytes.map { alphabet[Int($0) % alphabet.count] })
    }

    static func sha256(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

protocol SecretStore {
    func read(_ account: String) -> Data?
    func write(_ data: Data, account: String)
    func delete(_ account: String)
}

struct KeychainStore: SecretStore {
    let service: String

    func read(_ account: String) -> Data? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account,
                                    kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }

    func write(_ data: Data, account: String) {
        delete(account)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account,
                                    kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        SecItemAdd(query as CFDictionary, nil)
    }

    func delete(_ account: String) {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        SecItemDelete(query as CFDictionary)
    }
}

struct CommunitySession: Codable, Equatable {
    var token: String
    var userID: String
    var name: String
    var appleUserID: String
    /// The community this account belongs to.
    var origin: String
}

/// The recipe snapshot the community's `/api/v1/publish` accepts
/// (`src/lib/community-contract.ts`). Private notes and pantry mappings are left out.
struct CommunitySnapshot: Encodable, Equatable {
    struct Ingredient: Encodable, Equatable { var name: String; var quantity: Double?; var unit: String?; var note: String? }
    struct Step: Encodable, Equatable { var text: String }

    var version = 1
    var title: String
    var description: String?
    var tags: [String]
    var servings: Int?
    var totalTimeMinutes: Int?
    var sourceUrl: String?
    var photoDataUrl: String?
    var ingredients: [Ingredient]
    var steps: [Step]

    static let maxPhotoCharacters = 500_000

    init(title: String, summary: String?, tags: [String], servings: Int?, totalTimeMinutes: Int?, sourceURL: String?,
         photo: Data?, ingredients: [SousChef.Ingredient], steps: [RecipeStep]) {
        self.title = String(title.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
        description = summary?.nilIfEmpty
        self.tags = Array(tags.compactMap(\.nilIfEmpty).prefix(30))
        self.servings = servings.flatMap { $0 > 0 ? $0 : nil }
        self.totalTimeMinutes = totalTimeMinutes.flatMap { $0 > 0 ? $0 : nil }
        sourceUrl = sourceURL?.nilIfEmpty.flatMap { $0.hasPrefix("https://") || $0.hasPrefix("http://") ? $0 : nil }
        photoDataUrl = photo.flatMap(Self.photoDataURL)
        self.ingredients = ingredients.prefix(200).compactMap { ingredient in
            ingredient.name.nilIfEmpty.map { Ingredient(name: $0, quantity: ingredient.quantity, unit: ingredient.unit?.nilIfEmpty, note: ingredient.note?.nilIfEmpty) }
        }
        self.steps = steps.prefix(200).compactMap { $0.text.nilIfEmpty.map(Step.init(text:)) }
    }

    init(recipe: Recipe) {
        self.init(title: recipe.title, summary: recipe.summary, tags: recipe.tags, servings: recipe.servings, totalTimeMinutes: recipe.totalTimeMinutes,
                  sourceURL: recipe.sourceURL, photo: recipe.photo, ingredients: recipe.ingredients, steps: recipe.steps)
    }

    /// A JPEG data URL small enough for the community's photo limit, or nil.
    static func photoDataURL(_ data: Data) -> String? {
        for (dimension, quality) in [(1200.0, 0.75), (900.0, 0.65), (640.0, 0.55)] {
            guard let jpeg = ImageTools.compressed(data, maxDimension: dimension, quality: quality) else { return nil }
            let url = "data:image/jpeg;base64," + jpeg.base64EncodedString()
            if url.count <= maxPhotoCharacters { return url }
        }
        return nil
    }
}

struct PublishPayload: Encodable, Equatable {
    var id: String?
    var sourceKey: String
    var snapshot: CommunitySnapshot
    var visibility: String

    /// Stable per recipe, so republishing updates the same publication.
    static func sourceKey(for recipeID: UUID) -> String { AppleNonce.sha256("sous-chef-ios:\(recipeID.uuidString.lowercased())") }
}

/// Requests for the community's `/api/v1` HTTP API.
enum CommunityAPI {
    enum APIError: LocalizedError, Equatable {
        case notAuthenticated, server(String), badResponse
        var errorDescription: String? {
            switch self {
            case .notAuthenticated: "Your community sign-in has expired. Sign in again."
            case .server(let message): message
            case .badResponse: "The recipe community couldn't be reached. Try again."
            }
        }
    }

    struct SessionResponse: Decodable {
        struct User: Decodable { let id: String; let name: String }
        let token: String
        let user: User
    }

    private struct Failure: Decodable { let error: String }

    struct SessionBody: Encodable {
        let identityToken: String
        let authorizationCode: String
        let nonce: String
        let fullName: String?
    }

    static func request(_ base: URL, _ path: String, token: String? = nil, body: some Encodable) throws -> URLRequest {
        var request = URLRequest(url: base.appending(path: path), timeoutInterval: 30)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        request.httpBody = try JSONEncoder().encode(body)
        return request
    }

    static func sessionRequest(_ base: URL, identityToken: String, authorizationCode: String, rawNonce: String, fullName: String?) throws -> URLRequest {
        try request(base, "api/v1/apple/session", body: SessionBody(identityToken: identityToken, authorizationCode: authorizationCode, nonce: rawNonce, fullName: fullName))
    }

    static func send<T: Decodable>(_ request: URLRequest, as type: T.Type) async throws -> T {
        let (data, response): (Data, URLResponse)
        do { (data, response) = try await URLSession.shared.data(for: request) } catch { throw APIError.badResponse }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 { throw APIError.notAuthenticated }
        guard (200..<300).contains(status) else {
            throw (try? JSONDecoder().decode(Failure.self, from: data)).map { APIError.server($0.error) } ?? APIError.badResponse
        }
        do { return try JSONDecoder().decode(T.self, from: data) } catch { throw APIError.badResponse }
    }
}

/// The person's optional community account, from Sign in with Apple. Browsing,
/// saving and reporting don't need it; publishing does. The publisher token
/// lives in the Keychain.
@Observable
final class CommunityAccount {
    static let shared = CommunityAccount()

    private(set) var session: CommunitySession?
    /// Recipe UUID → publication id on the session's community.
    private(set) var publications: [String: String]
    private let store: SecretStore
    private let defaults: UserDefaults

    private enum Keys {
        static let session = "community.session"
        static let publications = "community.publications"
        static let installed = "community.installed"
    }

    init(store: SecretStore = KeychainStore(service: "io.souschef.community"), defaults: UserDefaults = .standard, observeRevocation: Bool = true) {
        self.store = store
        self.defaults = defaults
        // Keychain items outlive an uninstall; don't resurrect an old account.
        if !defaults.bool(forKey: Keys.installed) {
            store.delete(Keys.session)
            defaults.set(true, forKey: Keys.installed)
        }
        session = store.read(Keys.session).flatMap { try? JSONDecoder().decode(CommunitySession.self, from: $0) }
        publications = defaults.dictionary(forKey: Keys.publications) as? [String: String] ?? [:]
        if observeRevocation {
            NotificationCenter.default.addObserver(forName: ASAuthorizationAppleIDProvider.credentialRevokedNotification, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.signOut() }
            }
        }
    }

    var isSignedIn: Bool { session != nil }

    func save(_ session: CommunitySession) {
        if self.session?.userID != session.userID || self.session?.origin != session.origin { setPublications([:]) }
        self.session = session
        if let data = try? JSONEncoder().encode(session) { store.write(data, account: Keys.session) }
    }

    /// Forgets the account on this device. The community account itself stays.
    func signOut() {
        session = nil
        store.delete(Keys.session)
        setPublications([:])
    }

    func completeSignIn(_ authorization: ASAuthorization, rawNonce: String, community: URL) async throws {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let identityToken = credential.identityToken.flatMap({ String(data: $0, encoding: .utf8) }),
              let code = credential.authorizationCode.flatMap({ String(data: $0, encoding: .utf8) }) else {
            throw CommunityAPI.APIError.server("Sign in with Apple didn't return a credential. Try again.")
        }
        // Apple shares the name only the first time; the server keeps it from then on.
        let fullName = credential.fullName.map { PersonNameComponentsFormatter.localizedString(from: $0, style: .default) }?.nilIfEmpty
        let request = try CommunityAPI.sessionRequest(community, identityToken: identityToken, authorizationCode: code, rawNonce: rawNonce, fullName: fullName)
        let response = try await CommunityAPI.send(request, as: CommunityAPI.SessionResponse.self)
        save(CommunitySession(token: response.token, userID: response.user.id, name: response.user.name,
                              appleUserID: credential.user, origin: community.absoluteString))
    }

    /// Signs out when the Apple ID credential was revoked or removed.
    func checkCredentialState() async {
        guard let appleUserID = session?.appleUserID else { return }
        do {
            let state = try await ASAuthorizationAppleIDProvider().credentialState(forUserID: appleUserID)
            if state == .revoked || state == .notFound { signOut() }
        } catch {
            // Builds without the Sign in with Apple entitlement can't ask; keep the session.
        }
    }

    func rename(_ name: String) async throws {
        struct Body: Encodable { let name: String }
        struct Result: Decodable { let name: String }
        let result = try await call("api/v1/me/name", body: Body(name: name), as: Result.self)
        session?.name = result.name
        if let session { save(session) }
    }

    /// Deletes the community account, its publications and its Apple sign-in.
    func deleteAccount() async throws {
        struct Empty: Encodable {}
        struct Result: Decodable { let success: Bool }
        _ = try await call("api/v1/account/delete", body: Empty(), as: Result.self)
        signOut()
    }

    func publicationID(for recipe: Recipe) -> String? { publications[recipe.uuid.uuidString] }

    func publish(_ recipe: Recipe, visibility: String) async throws {
        struct Result: Decodable { let id: String; let revision: Double }
        let payload = PublishPayload(id: publicationID(for: recipe), sourceKey: PublishPayload.sourceKey(for: recipe.uuid),
                                     snapshot: CommunitySnapshot(recipe: recipe), visibility: visibility)
        let result = try await call("api/v1/publish", body: payload, as: Result.self)
        var updated = publications
        updated[recipe.uuid.uuidString] = result.id
        setPublications(updated)
    }

    func unpublish(_ recipe: Recipe) async throws {
        guard let id = publicationID(for: recipe) else { return }
        struct Body: Encodable { let id: String }
        struct Result: Decodable { let success: Bool }
        _ = try await call("api/v1/unpublish", body: Body(id: id), as: Result.self)
        var updated = publications
        updated[recipe.uuid.uuidString] = nil
        setPublications(updated)
    }

    private func call<T: Decodable>(_ path: String, body: some Encodable, as type: T.Type) async throws -> T {
        guard let session, let base = URL(string: session.origin) else { throw CommunityAPI.APIError.notAuthenticated }
        do {
            return try await CommunityAPI.send(try CommunityAPI.request(base, path, token: session.token, body: body), as: type)
        } catch CommunityAPI.APIError.notAuthenticated {
            signOut()
            throw CommunityAPI.APIError.notAuthenticated
        }
    }

    private func setPublications(_ value: [String: String]) {
        publications = value
        defaults.set(value, forKey: Keys.publications)
    }
}
