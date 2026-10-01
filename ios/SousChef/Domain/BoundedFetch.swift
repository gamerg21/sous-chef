import Foundation

/// Downloads with a hard byte budget and a redirect rule. Bytes are counted as
/// they arrive (after any content decoding), and the transfer is cancelled the
/// moment the budget runs out, so an oversized or lying response never ends up
/// fully buffered in memory.
nonisolated enum BoundedFetch {
    nonisolated enum FetchError: Error, Equatable {
        case tooLarge, redirectBlocked, notHTTP
    }

    /// What to do when the body is larger than the budget.
    nonisolated enum Overflow {
        /// Fail with `FetchError.tooLarge`.
        case fail
        /// Stop reading and keep the first `limit` bytes.
        case truncate
    }

    nonisolated enum Redirects {
        /// Follow redirects within the original origin only. Used for anything
        /// that carries credentials.
        case sameOriginOnly
        /// Follow redirects anywhere except from HTTPS down to HTTP, always
        /// stripping credentials.
        case anyCredentialFree
    }

    /// A cookie-free, cache-free configuration for talking to other servers.
    static var anonymousConfiguration: URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCredentialStorage = nil
        configuration.urlCache = nil
        configuration.timeoutIntervalForRequest = 20
        configuration.waitsForConnectivity = false
        return configuration
    }

    /// Shared session for untrusted content: never sends or stores cookies.
    static let anonymous = URLSession(configuration: anonymousConfiguration)

    /// `session` must not have its own delegate; each request gets one.
    static func data(for request: URLRequest, limit: Int, overflow: Overflow = .fail, redirects: Redirects,
                     session: URLSession = anonymous) async throws -> (Data, HTTPURLResponse) {
        let loader = Loader(origin: request.url, limit: limit, overflow: overflow, redirects: redirects)
        let task = session.dataTask(with: request)
        task.delegate = loader
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                loader.start(task, continuation: continuation)
            }
        } onCancel: {
            task.cancel()
        }
    }

    /// True when both URLs share a scheme, host and effective port.
    static func sameOrigin(_ a: URL, _ b: URL) -> Bool {
        guard let left = Origin(a), let right = Origin(b) else { return false }
        return left == right
    }

    nonisolated struct Origin: Equatable {
        let scheme: String
        let host: String
        let port: Int

        init?(_ url: URL) {
            guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https",
                  var host = url.host(percentEncoded: false)?.lowercased(), !host.isEmpty else { return nil }
            while host.hasSuffix(".") { host.removeLast() }
            self.scheme = scheme
            self.host = host
            port = url.port ?? (scheme == "https" ? 443 : 80)
        }
    }

    nonisolated private final class Loader: NSObject, URLSessionDataDelegate, @unchecked Sendable {
        private let origin: URL?
        private let limit: Int
        private let overflow: Overflow
        private let redirects: Redirects
        private let lock = NSLock()
        private var body = Data()
        private var response: HTTPURLResponse?
        private var blockedRedirect = false
        private var continuation: CheckedContinuation<(Data, HTTPURLResponse), Error>?

        init(origin: URL?, limit: Int, overflow: Overflow, redirects: Redirects) {
            self.origin = origin
            self.limit = limit
            self.overflow = overflow
            self.redirects = redirects
        }

        func start(_ task: URLSessionDataTask, continuation: CheckedContinuation<(Data, HTTPURLResponse), Error>) {
            lock.withLock { self.continuation = continuation }
            task.resume()
        }

        private func finish(_ result: Result<(Data, HTTPURLResponse), Error>) {
            let pending = lock.withLock { () -> CheckedContinuation<(Data, HTTPURLResponse), Error>? in
                defer { continuation = nil }
                return continuation
            }
            pending?.resume(with: result)
        }

        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
            guard let from = task.currentRequest?.url ?? origin, let to = request.url, let target = Origin(to) else {
                lock.withLock { blockedRedirect = true }
                return completionHandler(nil)
            }
            switch redirects {
            case .sameOriginOnly:
                guard let origin, BoundedFetch.sameOrigin(origin, to) else {
                    lock.withLock { blockedRedirect = true }
                    return completionHandler(nil)
                }
                completionHandler(request)
            case .anyCredentialFree:
                if from.scheme?.lowercased() == "https" && target.scheme == "http" {
                    lock.withLock { blockedRedirect = true }
                    return completionHandler(nil)
                }
                var stripped = request
                for header in ["Cookie", "Authorization", "Proxy-Authorization"] { stripped.setValue(nil, forHTTPHeaderField: header) }
                completionHandler(stripped)
            }
        }

        func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
            guard let http = response as? HTTPURLResponse else {
                finish(.failure(FetchError.notHTTP))
                return completionHandler(.cancel)
            }
            lock.withLock { self.response = http }
            // A declared length over budget is rejected up front; an absent or
            // understated one is caught while counting received bytes.
            if overflow == .fail, http.expectedContentLength > Int64(limit) {
                finish(.failure(FetchError.tooLarge))
                return completionHandler(.cancel)
            }
            completionHandler(.allow)
        }

        func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
            let outcome = lock.withLock { () -> Result<(Data, HTTPURLResponse), Error>? in
                let room = limit - body.count
                guard data.count > room else { body.append(data); return nil }
                if overflow == .fail { return .failure(FetchError.tooLarge) }
                body.append(data.prefix(room))
                return response.map { .success((body, $0)) } ?? .failure(FetchError.notHTTP)
            }
            if let outcome {
                finish(outcome)
                dataTask.cancel()
            }
        }

        func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
            let (body, response, blocked) = lock.withLock { (self.body, self.response, blockedRedirect) }
            if blocked { return finish(.failure(FetchError.redirectBlocked)) }
            if let error { return finish(.failure(error)) }
            guard let response else { return finish(.failure(FetchError.notHTTP)) }
            finish(.success((body, response)))
        }
    }
}
