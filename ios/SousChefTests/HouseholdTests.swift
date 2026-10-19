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
        #expect(HouseholdText.summary(isMember: false, ownerName: nil, isSharing: true, others: 0) == "Just you")
        #expect(HouseholdText.summary(isMember: false, ownerName: nil, isSharing: true, others: 0, pending: 1) == "Invite waiting")
        #expect(HouseholdText.summary(isMember: false, ownerName: nil, isSharing: true, others: 0, pending: 2) == "2 invites waiting")
        #expect(HouseholdText.summary(isMember: false, ownerName: nil, isSharing: true, others: 1, pending: 1) == "Shared with 1 person")
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

    @Test func pendingPeopleAreNamed() {
        // CloudKit has no name for someone who hasn't accepted yet.
        #expect(HouseholdText.personName(nil, remembered: "Ana Vina", email: "ana@example.com", phone: nil) == "Ana Vina")
        #expect(HouseholdText.personName(PersonNameComponents(), remembered: nil, email: "ana@example.com", phone: nil) == "ana@example.com")
        #expect(HouseholdText.personName(nil, remembered: nil, email: nil, phone: nil) == "Invited person")
        var components = PersonNameComponents()
        components.givenName = "Ana"
        #expect(HouseholdText.personName(components, remembered: "Wife", email: nil, phone: nil) == "Ana")
    }

    @Test func inviteAddresses() {
        #expect(InviteAddress(typed: " Ana@Example.com ") == .email("ana@example.com"))
        #expect(InviteAddress(typed: "+1 (555) 555-0100") == .phone("+15555550100"))
        #expect(InviteAddress(typed: "555-0100") == .phone("5550100"))
        #expect(InviteAddress(typed: "ana") == nil)
        #expect(InviteAddress(typed: "ana@example") == nil)
        #expect(InviteAddress(typed: "12345") == nil)
        // The same number with or without the country code is the same person.
        #expect(InviteAddress.phone("+15555550100").key == InviteAddress.phone("5555550100").key)
        #expect(InviteAddress.email("ana@example.com").key == InviteAddress.from(email: "ANA@example.com", phone: nil)?.key)
        #expect(InviteAddress.from(email: nil, phone: "(555) 555-0100") == .phone("5555550100"))
        #expect(InviteAddress.from(email: "", phone: nil) == nil)
    }

    @Test func inviteMessage() {
        let url = URL(string: "https://www.icloud.com/share/abc")!
        let text = HouseholdText.inviteMessage(url: url, kitchenTitle: "George\u{2019}s Kitchen")
        #expect(text.contains("\u{201C}George\u{2019}s Kitchen\u{201D}"))
        #expect(text.hasSuffix(url.absoluteString))
        #expect(HouseholdText.inviteMessage(url: url, kitchenTitle: nil).hasPrefix("Join my kitchen"))
    }

    @Test func containerMatchesKitchen() {
        #expect(HouseholdSharing.containerIdentifier == Kitchen.cloudContainerID)
    }
}
