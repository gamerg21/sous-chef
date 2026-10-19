import Contacts
import ContactsUI
import Foundation
import MessageUI
import UIKit

/// The phone number or email an invitation goes to. CloudKit matches it to
/// the person's Apple Account, so only they can open the link.
enum InviteAddress: Equatable, Hashable {
    case email(String)
    case phone(String)

    /// A phone number as CloudKit looks it up: digits, keeping a leading "+".
    static func phoneString(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        return (trimmed.hasPrefix("+") ? "+" : "") + trimmed.filter(\.isNumber)
    }

    /// What Messages sends to: the number or the email.
    var recipient: String {
        switch self {
        case .email(let email): email
        case .phone(let phone): phone
        }
    }

    /// Matches the same person however the number was written: emails
    /// lowercased, phones by their last 10 digits (so "+1" or not doesn't matter).
    var key: String {
        switch self {
        case .email(let email): "email:" + email.lowercased()
        case .phone(let phone): "phone:" + String(phone.filter(\.isNumber).suffix(10))
        }
    }

    /// The address CloudKit reports for a participant, if any.
    static func from(email: String?, phone: String?) -> InviteAddress? {
        if let email = email?.nilIfEmpty { return .email(email.lowercased()) }
        if let phone = phone?.nilIfEmpty { return .phone(phoneString(phone)) }
        return nil
    }

    /// Every way to reach a contact, best first: iPhone and mobile numbers,
    /// then other numbers, then emails. The invite goes to the first one
    /// that belongs to an Apple Account.
    static func candidates(phones: [(label: String?, number: String)], emails: [String]) -> [InviteAddress] {
        let mobileLabels: Set<String> = [CNLabelPhoneNumberiPhone, CNLabelPhoneNumberMobile]
        let mobile = phones.filter { $0.label.map(mobileLabels.contains) ?? false }
        let other = phones.filter { !($0.label.map(mobileLabels.contains) ?? false) }
        let all = (mobile + other).compactMap { from(email: nil, phone: $0.number) }
            + emails.compactMap { from(email: $0, phone: nil) }
        var seen = Set<String>()
        return all.filter { seen.insert($0.key).inserted }
    }
}

/// The names of people the owner invited, by address. CloudKit doesn't tell
/// the owner an invitee's name until they accept, so the name picked from
/// Contacts is remembered here, on this device and the owner's other devices.
enum InviteNames {
    private static let key = "household.inviteNames"

    static func name(for address: InviteAddress?) -> String? {
        guard let address else { return nil }
        return all()[address.key]?.nilIfEmpty
    }

    static func remember(_ name: String?, for address: InviteAddress) {
        guard let name = name?.trimmingCharacters(in: .whitespaces).nilIfEmpty else { return }
        var names = all()
        names[address.key] = name
        UserDefaults.standard.set(names, forKey: key)
        if hasKeyValueStore {
            NSUbiquitousKeyValueStore.default.set(names, forKey: key)
            NSUbiquitousKeyValueStore.default.synchronize()
        }
    }

    private static func all() -> [String: String] {
        var names = UserDefaults.standard.dictionary(forKey: key) as? [String: String] ?? [:]
        if hasKeyValueStore, let shared = NSUbiquitousKeyValueStore.default.dictionary(forKey: key) as? [String: String] {
            names.merge(shared) { local, _ in local }
        }
        return names
    }

    private static var hasKeyValueStore: Bool { Entitlements.contains("com.apple.developer.ubiquity-kvstore-identifier") }
}

extension HouseholdText {
    /// The text sent with an invitation link.
    static func inviteMessage(url: URL, kitchenTitle: String?) -> String {
        let kitchen = kitchenTitle?.nilIfEmpty.map { "\u{201C}\($0)\u{201D}" } ?? "my kitchen"
        return "Join \(kitchen) in Sous Chef so we can share the pantry, recipes, shopping list and meal plan. Open this on your iPhone, iPad or Mac: \(url.absoluteString)"
    }
}

// MARK: Contacts

/// Picks a person from Contacts, without asking for Contacts access: the
/// system picker only hands back the person tapped. Tapping a name picks
/// them; their numbers and emails come back best first.
@MainActor
final class InviteContactPicker: NSObject, CNContactPickerDelegate {
    private static var current: InviteContactPicker?
    private let completion: ([InviteAddress], String?) -> Void

    private init(completion: @escaping ([InviteAddress], String?) -> Void) {
        self.completion = completion
    }

    static func present(completion: @escaping ([InviteAddress], String?) -> Void) {
        guard let presenter = UIApplication.shared.topViewController else { return }
        let picker = InviteContactPicker(completion: completion)
        current = picker
        let controller = CNContactPickerViewController()
        controller.delegate = picker
        controller.predicateForEnablingContact = NSPredicate(format: "phoneNumbers.@count > 0 OR emailAddresses.@count > 0")
        controller.predicateForSelectionOfContact = NSPredicate(value: true)
        presenter.present(controller, animated: true)
    }

    nonisolated func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
        let phones = contact.phoneNumbers.map { (label: $0.label, number: $0.value.stringValue) }
        let emails = contact.emailAddresses.map { $0.value as String }
        let name = CNContactFormatter.string(from: contact, style: .fullName)
        MainActor.assumeIsolated { finish(InviteAddress.candidates(phones: phones, emails: emails), name) }
    }

    nonisolated func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
        MainActor.assumeIsolated { Self.current = nil }
    }

    private func finish(_ addresses: [InviteAddress], _ name: String?) {
        Self.current = nil
        guard !addresses.isEmpty else { return }
        // Let the picker finish closing before the next sheet appears.
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(450))
            completion(addresses, name)
        }
    }
}

// MARK: Messages

/// Opens Messages with the invitation filled in, addressed to the invitee.
@MainActor
final class InviteMessageComposer: NSObject, MFMessageComposeViewControllerDelegate {
    private static var current: InviteMessageComposer?
    private let completion: (Bool) -> Void

    private init(completion: @escaping (Bool) -> Void) {
        self.completion = completion
    }

    /// Without Messages (an iPad without SMS, or a Mac), the system share
    /// sheet offers the text instead. `completion` says whether it was sent.
    static func present(to address: InviteAddress, body: String, completion: @escaping (Bool) -> Void = { _ in }) {
        guard let presenter = UIApplication.shared.topViewController else { return }
        guard MFMessageComposeViewController.canSendText() else {
            let controller = UIActivityViewController(activityItems: [body], applicationActivities: nil)
            controller.completionWithItemsHandler = { _, completed, _, _ in completion(completed) }
            if let popover = controller.popoverPresentationController {
                popover.sourceView = presenter.view
                popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 0, height: 0)
                popover.permittedArrowDirections = []
            }
            presenter.present(controller, animated: true)
            return
        }
        let composer = InviteMessageComposer(completion: completion)
        current = composer
        let controller = MFMessageComposeViewController()
        controller.messageComposeDelegate = composer
        controller.recipients = [address.recipient]
        controller.body = body
        presenter.present(controller, animated: true)
    }

    nonisolated func messageComposeViewController(_ controller: MFMessageComposeViewController, didFinishWith result: MessageComposeResult) {
        MainActor.assumeIsolated {
            controller.dismiss(animated: true)
            completion(result == .sent)
            Self.current = nil
        }
    }
}
