import SwiftUI

/// The Settings home: a short list of groups, each opening its own page.
struct SettingsView: View {
    @Environment(Kitchen.self) private var kitchen
    @Environment(CommunityAccount.self) private var account
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var alerts: AlertPermissions.Status?
    @State private var showsBuild = false
    private let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
    private let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "—"

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 14) {
                        Image("Logo").resizable().frame(width: 56, height: 56).clipShape(.rect(cornerRadius: 13, style: .continuous))
                        VStack(alignment: .leading) {
                            Text("Sous Chef").font(.title2.weight(.bold))
                            Text("Your kitchen, your data").foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section {
                    NavigationLink { SyncSettingsView() } label: {
                        LabeledContent { Text(SyncSettingsView.summary(kitchen)) } label: {
                            SettingsIcon("Sync and Storage", systemImage: "icloud.fill", color: .blue)
                        }
                    }
                    .accessibilityIdentifier("syncSettings")
                    NavigationLink { NotificationSettingsView() } label: {
                        LabeledContent {
                            if let alerts, alerts.needsSettings || !alerts.timersCanAlert {
                                Image(systemName: "exclamationmark.circle.fill")
                                    .foregroundStyle(.orange)
                                    .accessibilityLabel("Needs attention")
                            }
                        } label: {
                            SettingsIcon("Notifications", systemImage: "bell.badge.fill", color: .red)
                        }
                    }
                    .accessibilityIdentifier("notificationSettings")
                } header: {
                    Eyebrow("Kitchen")
                }

                Section {
                    NavigationLink { IntelligenceSettingsView() } label: {
                        SettingsIcon("Intelligence and Lookups", systemImage: "apple.intelligence", color: .purple)
                    }
                    .accessibilityIdentifier("intelligenceSettings")
                    NavigationLink { CommunitySettingsView() } label: {
                        LabeledContent { Text(account.session?.name ?? "Not signed in") } label: {
                            SettingsIcon("Community", systemImage: "person.2.fill", color: .green)
                        }
                    }
                    .accessibilityIdentifier("communitySettings")
                } header: {
                    Eyebrow("Features")
                }

                Section {
                    Link(destination: URL(string: "https://sous-chef-website.vercel.app")!) { Label("Website", systemImage: "globe") }
                    Link(destination: URL(string: "https://github.com/gamerg21/sous-chef")!) { Label("Source code (AGPL-3.0)", systemImage: "chevron.left.forwardslash.chevron.right") }
                    // Tapping reveals the build number, like the Settings app's About page.
                    LabeledContent("Version", value: showsBuild ? "\(version) (\(build))" : version)
                        .contentShape(.rect)
                        .onTapGesture { showsBuild.toggle() }
                } header: {
                    Eyebrow("About")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done", role: .close) { dismiss() } } }
            // Also refreshed on return from a subpage or the Settings app.
            .onAppear { Task { alerts = await AlertPermissions.current() } }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { Task { alerts = await AlertPermissions.current() } }
            }
        }
    }
}

/// A row title with a small colored icon tile, like the Settings app's.
struct SettingsIcon: View {
    let title: String
    let systemImage: String
    let color: Color

    init(_ title: String, systemImage: String, color: Color) {
        self.title = title
        self.systemImage = systemImage
        self.color = color
    }

    var body: some View {
        Label {
            Text(title)
        } icon: {
            Image(systemName: systemImage)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: 28, height: 28)
                .background(color.gradient, in: .rect(cornerRadius: 7, style: .continuous))
        }
    }
}

struct ExportFile: Identifiable {
    let url: URL
    var id: URL { url }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

struct ServerConnectView: View {
    @Environment(Kitchen.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @State private var address = UserDefaults.standard.string(forKey: "server.url") ?? ""
    @State private var email = UserDefaults.standard.string(forKey: "server.email") ?? ""
    @State private var password = ""
    @State private var name = ""
    @State private var createAccount = false
    @State private var working = false
    @State private var error: String?
    @State private var confirmInsecure = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("http://192.168.1.20:3000", text: $address)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textContentType(.URL)
                        .accessibilityIdentifier("serverAddress")
                } header: {
                    Eyebrow("Server address")
                } footer: {
                    Text("The address you open Sous Chef at in a browser, such as your home server's IP, a .local name or a Tailscale address.")
                }
                Section {
                    Picker("", selection: $createAccount) {
                        Text("Sign in").tag(false)
                        Text("Create account").tag(true)
                    }
                    .pickerStyle(.segmented)
                    if createAccount { TextField("Your name", text: $name).textContentType(.name) }
                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Password", text: $password)
                        .textContentType(createAccount ? .newPassword : .password)
                } header: {
                    Eyebrow("Your account on that server")
                }
                if let error {
                    Section { Text(error).foregroundStyle(.orange) }
                }
                Section {
                    Text("The first time you connect, matching items already on this device are paired with your server's kitchen instead of being duplicated. Everything else is copied both ways.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Connect server")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if working { ProgressView() } else {
                        Button("Connect", role: .confirm) {
                            if let url = try? ServerClient.normalize(address), ServerClient.isInsecureRemote(url) { confirmInsecure = true } else { Task { await connect() } }
                        }
                        .disabled(address.nilIfEmpty == nil || email.nilIfEmpty == nil || password.count < 8)
                    }
                }
            }
            .alert("Connect without encryption?", isPresented: $confirmInsecure) {
                Button("Connect anyway", role: .destructive) { Task { await connect(allowInsecure: true) } }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This address uses plain HTTP outside your home network, so your password could be seen in transit. Use an https:// address if your server has one.")
            }
            .interactiveDismissDisabled(working)
        }
    }

    private func connect(allowInsecure: Bool = false) async {
        working = true
        error = nil
        defer { working = false }
        do {
            try await kitchen.server.connect(address: address, email: email, password: password, createAccount: createAccount, name: name.nilIfEmpty, allowInsecure: allowInsecure)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
