import CloudKit
import Foundation
import Testing
@testable import SousChef

/// The words iCloud households show in Settings, the join sheet and errors.
struct HouseholdTests {
    @Test func settingsSummary() {
        #expect(HouseholdText.summary(isMember: false, ownerName: nil, isSharing: false, others: 0) == "Just you")
        // A remembered count doesn't matter once sharing stops.
        #expect(HouseholdText.summary(isMember: false, ownerName: nil, isSharing: false, others: 3) == "Just you")
        #expect(HouseholdText.summary(isMember: false, ownerName: nil, isSharing: true, others: 0) == "Invite sent")
        #expect(HouseholdText.summary(isMember: false, ownerName: nil, isSharing: true, others: 1) == "Shared with 1 person")
        #expect(HouseholdText.summary(isMember: false, ownerName: nil, isSharing: true, others: 2) == "Shared with 2 people")
        #expect(HouseholdText.summary(isMember: true, ownerName: "Sam", isSharing: true, others: 2) == "Sam\u{2019}s kitchen")
        #expect(HouseholdText.summary(isMember: true, ownerName: "", isSharing: false, others: 0) == "Shared kitchen")
        #expect(HouseholdText.summary(isMember: true, ownerName: nil, isSharing: false, others: 0) == "Shared kitchen")
    }

    @Test func kitchenTitle() {
        #expect(HouseholdText.kitchenTitle(ownerName: "Sam") == "Sam\u{2019}s Kitchen")
        #expect(HouseholdText.kitchenTitle(ownerName: nil) == "Sous Chef Kitchen")
        #expect(HouseholdText.kitchenTitle(ownerName: "  ") == "Sous Chef Kitchen")
    }

    @Test func names() {
        var components = PersonNameComponents()
        components.givenName = "Sam"
        components.familyName = "Rivera"
        #expect(HouseholdText.displayName(components, email: "sam@example.com", phone: nil) == "Sam Rivera")
        #expect(HouseholdText.displayName(PersonNameComponents(), email: "sam@example.com", phone: nil) == "sam@example.com")
        #expect(HouseholdText.displayName(nil, email: nil, phone: "+15555550100") == "+15555550100")
        #expect(HouseholdText.displayName(nil, email: "", phone: nil) == "Someone")

        #expect(HouseholdText.firstName("Sam Rivera") == "Sam")
        #expect(HouseholdText.firstName("sam@example.com") == "sam@example.com")
        #expect(HouseholdText.firstName("+1 555 555 0100") == "+1 555 555 0100")
        #expect(HouseholdText.firstName("Someone") == "Someone")
    }

    @Test func personBadges() {
        func person(_ role: HouseholdPerson.Role, _ status: HouseholdPerson.Status, me: Bool) -> HouseholdPerson {
            HouseholdPerson(id: "1", name: "Sam", detail: nil, role: role, status: status, isMe: me)
        }
        #expect(HouseholdText.badge(for: person(.owner, .accepted, me: false)) == "Owner")
        #expect(HouseholdText.badge(for: person(.owner, .accepted, me: true)) == "Owner · You")
        #expect(HouseholdText.badge(for: person(.member, .invited, me: false)) == "Invited")
        #expect(HouseholdText.badge(for: person(.member, .accepted, me: true)) == "You")
        #expect(HouseholdText.badge(for: person(.member, .accepted, me: false)) == "")
    }

    @Test func errorMessages() {
        #expect(HouseholdText.message(for: CKError(.notAuthenticated)) == "Sign in to iCloud in the Settings app, then try again.")
        #expect(HouseholdText.message(for: CKError(.networkUnavailable)) == "Couldn't reach iCloud. Check your connection and try again.")
        #expect(HouseholdText.message(for: CKError(.networkFailure)) == "Couldn't reach iCloud. Check your connection and try again.")
        #expect(HouseholdText.message(for: CKError(.unknownItem)) == "This kitchen isn't shared anymore. Ask for a new invitation.")
        #expect(HouseholdText.message(for: CKError(.quotaExceeded)).contains("storage is full"))
        #expect(HouseholdText.message(for: CKError(.internalError)) == "Something went wrong with iCloud. Try again.")
        // A partial failure reports the error inside it.
        let partial = CKError(.partialFailure, userInfo: [CKPartialErrorsByItemIDKey: ["share": CKError(.networkFailure)]])
        #expect(HouseholdText.message(for: partial) == "Couldn't reach iCloud. Check your connection and try again.")
        #expect(HouseholdText.message(for: HouseholdError.serverConnected).contains("Disconnect it"))

        #expect(HouseholdText.isGone(CKError(.zoneNotFound)))
        #expect(!HouseholdText.isGone(CKError(.networkFailure)))
        #expect(HouseholdText.isNetwork(CKError(.serviceUnavailable)))
    }

    @Test func syncSummaryAndFooter() {
        #expect(SyncSettingsView.summary(serverHost: "nas.local", usesICloud: true, shared: true) == "nas.local")
        #expect(SyncSettingsView.summary(serverHost: nil, usesICloud: false, shared: false) == "This device")
        #expect(SyncSettingsView.summary(serverHost: nil, usesICloud: true, shared: false) == "iCloud")
        #expect(SyncSettingsView.summary(serverHost: nil, usesICloud: true, shared: true) == "iCloud, shared")

        #expect(SyncSettingsView.iCloudFooter(usesICloud: false, isMember: false, ownerName: nil, isSharing: false).contains("only on this device"))
        #expect(SyncSettingsView.iCloudFooter(usesICloud: true, isMember: true, ownerName: "Sam", isSharing: false).hasPrefix("You're in Sam\u{2019}s kitchen."))
        #expect(SyncSettingsView.iCloudFooter(usesICloud: true, isMember: true, ownerName: nil, isSharing: false).hasPrefix("You're in a shared kitchen."))
        #expect(SyncSettingsView.iCloudFooter(usesICloud: true, isMember: false, ownerName: nil, isSharing: true).contains("shared with the people you invited"))
        #expect(!SyncSettingsView.iCloudFooter(usesICloud: true, isMember: false, ownerName: nil, isSharing: false).contains("shared"))
    }

    @Test func containerMatchesKitchen() {
        #expect(HouseholdSharing.containerIdentifier == Kitchen.cloudContainerID)
    }
}
