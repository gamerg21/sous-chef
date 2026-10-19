import CloudKit
import Foundation
import Observation
import UIKit

/// One person in a shared kitchen.
struct HouseholdPerson: Identifiable, Equatable {
    enum Role: Equatable { case owner, member }
    enum Status: Equatable { case accepted, invited }

    let id: String
    let name: String
    /// Email or phone, when CloudKit shares it and it isn't already the name.
    let detail: String?
    let role: Role
    let status: Status
    let isMe: Bool
    /// Where their invitation went, for resending it.
    var address: InviteAddress? = nil
}

/// An invitation the person tapped, waiting for them to choose how to join.
struct HouseholdInvitation: Identifiable {
    let id = UUID()
    let metadata: CKShare.Metadata
    /// The inviter's first name, or how CloudKit knows them.
    let ownerName: String
    let title: String
    /// Set when this device is already in someone else's kitchen; joining leaves it.
    let currentOwnerName: String?
}

/// Sharing the kitchen with other Apple IDs: the owner's zone-wide `CKShare`,
/// the people in it, and accepting, joining and leaving. Syncing itself is
/// `CloudSync`'s job.
@Observable
final class HouseholdSharing {
    static let shared = HouseholdSharing()

    /// The same container as `Kitchen.cloudContainerID`, readable off the main actor
    /// for the share sheet's transfer representation.
    nonisolated static let containerIdentifier = "iCloud.com.georgevina.souschef"

    /// The kitchen's share: the owner's own, or for a member the one they joined.
    private(set) var share: CKShare?
    private(set) var people: [HouseholdPerson] = []
    /// Whether the person's own kitchen is shared. Remembered so Settings can
    /// say so before iCloud answers.
    private(set) var isSharing: Bool {
        didSet { defaults.set(isSharing, forKey: Keys.sharing) }
    }
    /// How many other people joined the owner's kitchen, remembered for Settings.
    private(set) var otherCount: Int {
        didSet { defaults.set(otherCount, forKey: Keys.otherCount) }
    }
    /// How many invitations are waiting to be accepted, remembered for Settings.
    private(set) var pendingCount: Int {
        didSet { defaults.set(pendingCount, forKey: Keys.pendingCount) }
    }
    /// For a member: the owner's first name, remembered for Settings.
    private(set) var ownerName: String? {
        didSet { defaults.set(ownerName, forKey: Keys.ownerName) }
    }
    private(set) var loading = false
    private(set) var working = false
    var error: String?

    /// Shown app-wide by the join sheet.
    var pendingInvitation: HouseholdInvitation?
    private(set) var joining = false
    var joinError: String?
    /// A short app-wide message, such as tapping an invitation to your own kitchen.
    var notice: String?

    @ObservationIgnored private let defaults = UserDefaults.standard
    @ObservationIgnored private var kitchen: Kitchen { .shared }
    @ObservationIgnored private var container: CKContainer { CKContainer(identifier: Self.containerIdentifier) }

    private enum Keys {
        static let sharing = "household.sharing"
        static let otherCount = "household.otherCount"
        static let pendingCount = "household.pendingCount"
        static let ownerName = "household.ownerName"
    }

    private init() {
        isSharing = defaults.bool(forKey: Keys.sharing)
        otherCount = defaults.integer(forKey: Keys.otherCount)
        pendingCount = defaults.integer(forKey: Keys.pendingCount)
        ownerName = defaults.string(forKey: Keys.ownerName)
    }

    /// Households need iCloud on, a signed build, and no companion server.
    var canUseHouseholds: Bool { kitchen.iCloudAvailable && kitchen.usesICloud && !kitchen.server.isConnected }

    /// Whether a household is in use, which rules out connecting a companion server.
    var householdActive: Bool { kitchen.cloud.isHouseholdMember || (isSharing && kitchen.usesICloud) }

    /// The Settings row's summary.
    var summary: String {
        HouseholdText.summary(isMember: kitchen.cloud.isHouseholdMember, ownerName: ownerName,
                              isSharing: isSharing && kitchen.usesICloud, others: otherCount, pending: pendingCount)
    }

    // MARK: Loading

    /// Fetches the share for whichever kitchen is active.
    func refresh() async {
        guard canUseHouseholds, !loading else { return }
        loading = true
        defer { loading = false }
        do {
            if kitchen.cloud.isHouseholdMember {
                try await loadMemberShare()
            } else {
                try await loadShare()
            }
            error = nil
        } catch {
            self.error = HouseholdText.message(for: error)
        }
    }

    /// Owner: fetches the existing zone-wide share, if the kitchen is shared.
    /// A share left with no one else in it (say, from an earlier version) is
    /// deleted, so the kitchen is plainly private again.
    func loadShare() async throws {
        let share = try await fetchShare(in: container.privateCloudDatabase, zoneID: CloudSync.personalZoneID)
        if let share, Self.isEmpty(share) {
            try await deleteShare(share.recordID)
            apply(nil, owner: true)
        } else {
            apply(share, owner: true)
        }
    }

    /// No one but the owner is in it, invited or joined.
    private static func isEmpty(_ share: CKShare) -> Bool {
        !share.participants.contains { $0.role != .owner && $0.acceptanceStatus != .removed }
    }

    /// Member: fetches the share of the kitchen this device joined.
    private func loadMemberShare() async throws {
        let share = try await fetchShare(in: container.sharedCloudDatabase, zoneID: kitchen.cloud.activeZoneID)
        apply(share, owner: false)
    }

    /// The zone-wide share in `zoneID`, or nil when the zone or share doesn't exist.
    private func fetchShare(in database: CKDatabase, zoneID: CKRecordZone.ID) async throws -> CKShare? {
        do {
            return try await database.record(for: Self.shareID(in: zoneID)) as? CKShare
        } catch let error as CKError where HouseholdText.isGone(error) {
            return nil
        }
    }

    private static func shareID(in zoneID: CKRecordZone.ID) -> CKRecord.ID {
        CKRecord.ID(recordName: CKRecordNameZoneWideShare, zoneID: zoneID)
    }

    private func apply(_ share: CKShare?, owner: Bool) {
        self.share = share
        people = share.map(Self.people(in:)) ?? []
        if owner {
            isSharing = share != nil
            otherCount = people.filter { $0.role == .member && $0.status == .accepted }.count
            pendingCount = people.filter { $0.role == .member && $0.status == .invited }.count
        } else if let owner = people.first(where: { $0.role == .owner }) {
            ownerName = HouseholdText.firstName(owner.name)
        }
    }

    private static func people(in share: CKShare) -> [HouseholdPerson] {
        let me = share.currentUserParticipant
        return share.participants
            .filter { $0.acceptanceStatus != .removed }
            .map { participant in
                let identity = participant.userIdentity
                let email = identity.lookupInfo?.emailAddress
                let phone = identity.lookupInfo?.phoneNumber
                let address = InviteAddress.from(email: email, phone: phone)
                // CloudKit names people only once they accept; until then use
                // the name the owner picked from Contacts.
                let name = HouseholdText.personName(identity.nameComponents, remembered: InviteNames.name(for: address),
                                                    email: email, phone: phone,
                                                    isMe: participant == me, isOwner: participant.role == .owner)
                return HouseholdPerson(
                    id: participant.participantID,
                    name: name,
                    detail: [email, phone].compactMap { $0 }.first { $0 != name },
                    role: participant.role == .owner ? .owner : .member,
                    status: participant.acceptanceStatus == .accepted || participant.role == .owner ? .accepted : .invited,
                    isMe: participant == me,
                    address: address
                )
            }
            .sorted { lhs, rhs in
                if lhs.role != rhs.role { return lhs.role == .owner }
                if lhs.status != rhs.status { return lhs.status == .accepted }
                return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
            }
    }

    // MARK: Owner

    /// The kitchen's zone-wide share, or a new unsaved one when it isn't
    /// shared yet, so the share is only ever saved with someone invited.
    /// Saves the "Kitchen" zone first if it isn't in iCloud yet.
    private func shareToInvite() async throws -> CKShare {
        let database = container.privateCloudDatabase
        let zoneID = CloudSync.personalZoneID
        if let existing = try await fetchShare(in: database, zoneID: zoneID) { return existing }
        _ = try await database.save(CKRecordZone(zoneID: zoneID))
        let share = CKShare(recordZoneID: zoneID)
        share[CKShare.SystemFieldKey.title] = await kitchenTitle()
        share.publicPermission = .none
        return share
    }

    /// "George's Kitchen", from the person's iCloud name when CloudKit shares it.
    private func kitchenTitle() async -> String {
        guard let id = try? await container.userRecordID(),
              let participant = try? await container.shareParticipant(forUserRecordID: id) else {
            return HouseholdText.kitchenTitle(ownerName: nil)
        }
        return HouseholdText.kitchenTitle(ownerName: participant.userIdentity.nameComponents?.givenName)
    }

    /// Ends sharing: everyone else loses access to the kitchen right away.
    func stopSharing() async {
        working = true
        defer { working = false }
        do {
            try await deleteShare(share?.recordID ?? Self.shareID(in: CloudSync.personalZoneID))
            apply(nil, owner: true)
            error = nil
        } catch {
            self.error = HouseholdText.message(for: error)
        }
    }

    private func deleteShare(_ id: CKRecord.ID) async throws {
        do {
            _ = try await container.privateCloudDatabase.deleteRecord(withID: id)
        } catch let error as CKError where HouseholdText.isGone(error) {
            // Already gone.
        }
    }

    /// Invites one person: adds them to the share by a phone number or email
    /// (so the link opens only for their Apple Account), remembers their
    /// name, and opens Messages with the link. Given several ways to reach
    /// them, best first, it uses the first one with an Apple Account.
    func invite(_ addresses: [InviteAddress], name: String?) async {
        guard !working, !addresses.isEmpty else { return }
        working = true
        defer { working = false }
        do {
            let share = try await shareToInvite()
            var changed = share.creationDate == nil
            if share[CKShare.SystemFieldKey.thumbnailImageData] == nil, let art = Self.thumbnail() {
                // Messages shows it with the link.
                share[CKShare.SystemFieldKey.thumbnailImageData] = art
                changed = true
            }
            let address: InviteAddress
            if let invited = addresses.first(where: { Self.participant(for: $0, in: share) != nil }) {
                // Already invited: just send the link again.
                address = invited
            } else {
                let (found, participant) = try await lookUp(addresses, owner: share.owner)
                participant.permission = .readWrite
                share.addParticipant(participant)
                address = found
                changed = true
            }
            let saved = changed ? try await save(share) : share
            InviteNames.remember(name, for: address)
            apply(saved, owner: true)
            error = nil
            send(to: address, share: saved)
        } catch {
            self.error = HouseholdText.message(for: error)
        }
    }

    /// The first address that belongs to an Apple Account, or the first that
    /// CloudKit accepts (they can still accept once they sign in with it).
    private func lookUp(_ addresses: [InviteAddress], owner: CKShare.Participant) async throws -> (InviteAddress, CKShare.Participant) {
        var fallback: (InviteAddress, CKShare.Participant)?
        var lastError: Error?
        for address in addresses {
            do {
                let participant = switch address {
                case .email(let email): try await container.shareParticipant(forEmailAddress: email)
                case .phone(let phone): try await container.shareParticipant(forPhoneNumber: phone)
                }
                if let id = participant.userIdentity.userRecordID, id == owner.userIdentity.userRecordID {
                    lastError = HouseholdError.invitedSelf
                    continue
                }
                if participant.userIdentity.hasiCloudAccount { return (address, participant) }
                if fallback == nil { fallback = (address, participant) }
            } catch {
                lastError = error
            }
        }
        if let fallback { return fallback }
        throw lastError ?? CKError(.internalError)
    }

    /// The app's logo, small enough to travel with the share.
    private static func thumbnail() -> Data? {
        guard let logo = UIImage(named: "Logo") else { return nil }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let size = CGSize(width: 256, height: 256)
        return UIGraphicsImageRenderer(size: size, format: format).pngData { _ in
            logo.draw(in: CGRect(origin: .zero, size: size))
        }
    }

    /// Sends a waiting invitation again.
    func resend(to person: HouseholdPerson) {
        guard let share, let address = person.address else { return }
        send(to: address, share: share)
    }

    private func send(to address: InviteAddress, share: CKShare) {
        guard let url = share.url else {
            error = "iCloud didn't make an invitation link. Try again."
            return
        }
        let body = HouseholdText.inviteMessage(url: url, kitchenTitle: share[CKShare.SystemFieldKey.title] as? String)
        InviteMessageComposer.present(to: address, body: body)
    }

    /// Removes someone from the kitchen, or cancels their invitation.
    func remove(_ person: HouseholdPerson) async {
        guard let share, person.role != .owner,
              let participant = share.participants.first(where: { $0.participantID == person.id }) else { return }
        working = true
        defer { working = false }
        do {
            share.removeParticipant(participant)
            if Self.isEmpty(share) {
                // No one else left: stop sharing rather than keep an empty share.
                try await deleteShare(share.recordID)
                apply(nil, owner: true)
            } else {
                apply(try await save(share), owner: true)
            }
            error = nil
        } catch {
            self.error = HouseholdText.message(for: error)
            await refresh()
        }
    }

    private func save(_ share: CKShare) async throws -> CKShare {
        let result = try await container.privateCloudDatabase.modifyRecords(saving: [share], deleting: [], savePolicy: .changedKeys)
        guard let saved = try result.saveResults[share.recordID]?.get() as? CKShare else { throw CKError(.internalError) }
        return saved
    }

    private static func participant(for address: InviteAddress, in share: CKShare) -> CKShare.Participant? {
        share.participants.first { participant in
            participant.acceptanceStatus != .removed && participant.role != .owner
                && InviteAddress.from(email: participant.userIdentity.lookupInfo?.emailAddress,
                                      phone: participant.userIdentity.lookupInfo?.phoneNumber)?.key == address.key
        }
    }

    // MARK: Member

    /// Leaves the household and goes back to this person's own kitchen.
    ///
    /// A participant deleting the share from their shared database removes
    /// them from it (CloudKit keeps the share for everyone else). If that
    /// fails for a reason other than the network, deleting the zone from the
    /// shared database does the same.
    func leave() async throws {
        let zoneID = kitchen.cloud.activeZoneID
        let database = container.sharedCloudDatabase
        do {
            _ = try await database.deleteRecord(withID: Self.shareID(in: zoneID))
        } catch let error as CKError where HouseholdText.isGone(error) {
            // The owner already stopped sharing or removed this person.
        } catch let shareError as CKError where !HouseholdText.isNetwork(shareError) {
            do {
                _ = try await database.deleteRecordZone(withID: zoneID)
            } catch let zoneError as CKError where HouseholdText.isGone(zoneError) {
                // Already gone.
            } catch {
                throw shareError
            }
        }
        try await kitchen.cloud.leaveHousehold()
        // Leaving on purpose isn't the owner ending the household.
        kitchen.cloud.householdEndedNotice = nil
        share = nil
        people = []
        ownerName = nil
        await refresh()
    }

    /// The Leave button: `leave()` with its error shown on the page.
    func leaveFromSettings() async {
        working = true
        defer { working = false }
        do {
            try await leave()
            error = nil
        } catch {
            self.error = HouseholdText.message(for: error)
        }
    }

    // MARK: Accepting

    /// Called when the person taps an invitation. Shows the join sheet unless
    /// there's nothing to join.
    func handleAccepted(_ metadata: CKShare.Metadata) {
        let ownerName = HouseholdText.firstName(HouseholdText.displayName(
            metadata.ownerIdentity.nameComponents,
            email: metadata.ownerIdentity.lookupInfo?.emailAddress,
            phone: metadata.ownerIdentity.lookupInfo?.phoneNumber))
        if metadata.participantRole == .owner {
            notice = "That's the invitation to your own kitchen. Send it to someone else to cook together."
            return
        }
        let zoneID = metadata.share.recordID.zoneID
        if kitchen.cloud.isHouseholdMember && kitchen.cloud.activeZoneID == zoneID {
            notice = "You're already in \(HouseholdText.possessive(ownerName)) kitchen."
            return
        }
        let title = (metadata.share[CKShare.SystemFieldKey.title] as? String)?.nilIfEmpty
            ?? HouseholdText.kitchenTitle(ownerName: ownerName)
        joinError = nil
        pendingInvitation = HouseholdInvitation(
            metadata: metadata,
            ownerName: ownerName,
            title: title,
            currentOwnerName: kitchen.cloud.isHouseholdMember ? (self.ownerName ?? "another person") : nil
        )
    }

    /// Accepts the invitation and switches this device to the shared kitchen.
    func join(_ invitation: HouseholdInvitation, mergeLocal: Bool) async {
        guard !joining else { return }
        joining = true
        joinError = nil
        defer { joining = false }
        do {
            guard kitchen.iCloudAvailable else { throw HouseholdError.unavailable }
            guard !kitchen.server.isConnected else { throw HouseholdError.serverConnected }
            guard try await container.accountStatus() == .available else { throw CKError(.notAuthenticated) }
            _ = try await container.accept(invitation.metadata)
            if !kitchen.usesICloud { kitchen.setICloud(true) }
            if kitchen.cloud.isHouseholdMember { try await leave() }
            try await kitchen.cloud.joinHousehold(zoneID: invitation.metadata.share.recordID.zoneID, mergeLocal: mergeLocal)
            ownerName = invitation.ownerName
            share = invitation.metadata.share
            people = Self.people(in: invitation.metadata.share)
            pendingInvitation = nil
            await refresh()
        } catch {
            joinError = HouseholdText.message(for: error)
        }
    }

    func cancelInvitation() {
        guard !joining else { return }
        pendingInvitation = nil
        joinError = nil
    }

    /// Clears what's remembered about the owner's share, after the kitchen
    /// was removed from iCloud.
    func forgetShare() {
        apply(nil, owner: true)
    }
}

enum HouseholdError: LocalizedError {
    case unavailable, serverConnected, invitedSelf

    var errorDescription: String? {
        switch self {
        case .unavailable: "Households aren't available in this build."
        case .serverConnected: "Households use iCloud, so they're off while your Sous Chef server is connected. Disconnect it in Sync and Storage first."
        case .invitedSelf: "That's your own Apple Account. Invite someone else to cook with you."
        }
    }
}

/// The words households show, kept apart so they can be tested.
enum HouseholdText {
    /// "Just you", "Invite waiting", "Shared with 2 people", "Sam's kitchen".
    static func summary(isMember: Bool, ownerName: String?, isSharing: Bool, others: Int, pending: Int = 0) -> String {
        if isMember {
            guard let ownerName = ownerName?.nilIfEmpty else { return "Shared kitchen" }
            return "\(possessive(ownerName)) kitchen"
        }
        guard isSharing else { return "Just you" }
        switch others {
        case 0:
            switch pending {
            case 0: return "Just you"
            case 1: return "Invite waiting"
            default: return "\(pending) invites waiting"
            }
        case 1: return "Shared with 1 person"
        default: return "Shared with \(others) people"
        }
    }

    /// The note beside a person: "Owner", "You", "Invited".
    static func badge(for person: HouseholdPerson) -> String {
        var parts: [String] = []
        if person.role == .owner { parts.append("Owner") }
        if person.status == .invited { parts.append("Invited") }
        if person.isMe, person.name != "You" { parts.append("You") }
        return parts.joined(separator: " · ")
    }

    /// The share's title: "Sam's Kitchen", or "Sous Chef Kitchen" without a name.
    static func kitchenTitle(ownerName: String?) -> String {
        guard let ownerName = ownerName?.trimmingCharacters(in: .whitespaces).nilIfEmpty else { return "Sous Chef Kitchen" }
        return "\(possessive(ownerName)) Kitchen"
    }

    static func possessive(_ name: String) -> String { "\(name)\u{2019}s" }

    /// A person's full name, else their email or phone, else "Someone".
    static func displayName(_ components: PersonNameComponents?, email: String?, phone: String?) -> String {
        if let components {
            let name = components.formatted(.name(style: .medium)).trimmingCharacters(in: .whitespaces)
            if !name.isEmpty { return name }
        }
        return email?.nilIfEmpty ?? phone?.nilIfEmpty ?? "Someone"
    }

    /// The name CloudKit gives a person, else the one remembered from
    /// Contacts when they were invited, else their email or phone.
    static func personName(_ components: PersonNameComponents?, remembered: String?, email: String?, phone: String?,
                           isMe: Bool = false, isOwner: Bool = false) -> String {
        if let components, !components.formatted(.name(style: .medium)).trimmingCharacters(in: .whitespaces).isEmpty {
            return displayName(components, email: email, phone: phone)
        }
        if let remembered = remembered?.nilIfEmpty { return remembered }
        let fallback = displayName(nil, email: email, phone: phone)
        guard fallback == "Someone" else { return fallback }
        return isMe ? "You" : isOwner ? "Kitchen owner" : "Invited person"
    }

    /// "Sam" from "Sam Rivera"; emails and phone numbers stay whole.
    static func firstName(_ name: String) -> String {
        if name.contains("@") || name.first == "+" || name.first?.isNumber == true { return name }
        return name.split(separator: " ").first.map(String.init) ?? name
    }

    /// The share or zone no longer exists.
    static func isGone(_ error: CKError) -> Bool {
        [.unknownItem, .zoneNotFound, .userDeletedZone].contains(error.code)
    }

    static func isNetwork(_ error: CKError) -> Bool {
        [.networkUnavailable, .networkFailure, .serviceUnavailable, .requestRateLimited, .zoneBusy].contains(error.code)
    }

    /// What to tell the person when sharing, joining or leaving fails.
    static func message(for error: any Error) -> String {
        guard let error = error as? CKError else { return error.localizedDescription }
        if error.code == .partialFailure, let first = error.partialErrorsByItemID?.values.first {
            return message(for: first)
        }
        if isNetwork(error) { return "Couldn't reach iCloud. Check your connection and try again." }
        if isGone(error) { return "This kitchen isn't shared anymore. Ask for a new invitation." }
        switch error.code {
        case .notAuthenticated: return "Sign in to iCloud in the Settings app, then try again."
        case .accountTemporarilyUnavailable: return "iCloud is still setting up your account. Try again in a moment."
        case .quotaExceeded: return "Your iCloud storage is full. Free up some space, then try again."
        case .participantMayNeedVerification: return "Open the invitation again to confirm your Apple Account."
        case .permissionFailure: return "You don't have permission to do that in this kitchen."
        case .tooManyParticipants: return "This kitchen already has as many people as it can."
        case .managedAccountRestricted: return "This Apple Account can't share iCloud data."
        case .incompatibleVersion: return "Update Sous Chef, then try again."
        default: return "Something went wrong with iCloud. Try again."
        }
    }
}

extension UIApplication {
    /// The front-most view controller of the active window, for presenting UIKit sheets.
    var topViewController: UIViewController? {
        let scenes = connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        var controller = scene?.keyWindow?.rootViewController
        while let presented = controller?.presentedViewController, !presented.isBeingDismissed {
            controller = presented
        }
        return controller
    }
}
