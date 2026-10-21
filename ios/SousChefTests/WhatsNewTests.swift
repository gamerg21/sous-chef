import Testing
@testable import SousChef

/// "What's new" shows once per major or minor release, never for patches or fresh installs.
struct WhatsNewTests {
    @Test func showsOncePerFeatureRelease() {
        // Updating from 1.0 (nothing seen yet) to 1.1.0.
        #expect(WhatsNew.features(version: "1.1.0", seen: nil, onboarded: true) != nil)
        #expect(WhatsNew.features(version: "1.1.0", seen: "1.0", onboarded: true) != nil)
        // Already seen, or a patch of the same release.
        #expect(WhatsNew.features(version: "1.1.0", seen: "1.1", onboarded: true) == nil)
        #expect(WhatsNew.features(version: "1.1.2", seen: "1.1", onboarded: true) == nil)
        // A fresh install sees onboarding instead.
        #expect(WhatsNew.features(version: "1.1.0", seen: nil, onboarded: false) == nil)
        // A release without an entry shows nothing.
        #expect(WhatsNew.features(version: "9.9.0", seen: "1.1", onboarded: true) == nil)
    }

    @Test func releaseIsMajorAndMinor() {
        #expect(WhatsNew.release(of: "1.1.0") == "1.1")
        #expect(WhatsNew.release(of: "2.0") == "2.0")
        #expect(WhatsNew.release(of: "1.1.13") == "1.1")
    }
}
