import SwiftData
import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
    @Environment(Kitchen.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @AppStorage("icloud.enabled") private var iCloudEnabled = true
    @State private var connecting = false
    @State private var exportFile: ExportFile?
    @State private var importing = false
    @State private var message: String?
    @State private var communityURL = CommunityService.directURL
    @State private var offEnabled = OpenFoodFacts.enabled

    var body: some View {
        @Bindable var ai = kitchen.ai
        @Bindable var server = kitchen.server
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
                    Toggle(isOn: $iCloudEnabled) { Label("Sync with iCloud", systemImage: "icloud") }
                    LabeledContent("Status") {
                        HStack(spacing: 6) {
                            StatusDot(color: kitchen.usesICloud ? .green : .secondary)
                            Text(iCloudStatus)
                        }
                    }
                } header: {
                    Eyebrow("This device")
                } footer: {
                    Text(iCloudEnabled == kitchen.usesICloud
                         ? "Your kitchen is stored on this device\(kitchen.usesICloud ? " and in your private iCloud, so it follows you to your other Apple devices" : ""). Sous Chef has no servers of its own."
                         : "Restart Sous Chef to apply this change.")
                }

                Section {
                    if server.isConnected {
                        LabeledContent("Server", value: URL(string: server.address)?.host() ?? server.address)
                        LabeledContent("Account", value: server.email)
                        if server.households.count > 1 {
                            Picker("Kitchen", selection: Binding(get: { server.householdID ?? "" }, set: { id in
                                if let household = server.households.first(where: { $0.id == id }) { Task { await server.switchHousehold(household) } }
                            })) {
                                ForEach(server.households) { Text($0.name).tag($0.id) }
                            }
                        } else if let name = server.householdName {
                            LabeledContent("Kitchen", value: name)
                        }
                        LabeledContent("Sync") {
                            HStack(spacing: 6) {
                                switch server.status {
                                case .syncing: ProgressView().controlSize(.small); Text("Syncing…")
                                case .failed(let reason): StatusDot(color: .orange); Text(reason).lineLimit(2)
                                default:
                                    StatusDot(color: .green)
                                    Text(server.lastSynced.map { "Synced \($0.formatted(.relative(presentation: .named)))" } ?? "Ready")
                                }
                            }
                            .font(.callout)
                        }
                        Toggle("Sync automatically", isOn: $server.autoSync)
                        Button { Task { await server.syncNow() } } label: { Label("Sync now", systemImage: "arrow.triangle.2.circlepath") }
                            .disabled(server.status == .syncing)
                        Button(role: .destructive) { Task { await server.disconnect() } } label: { Label("Disconnect", systemImage: "link.badge.minus") }
                    } else {
                        Button { connecting = true } label: { Label("Connect your Sous Chef server", systemImage: "server.rack") }
                            .accessibilityIdentifier("connectServer")
                        if case .failed(let reason) = server.status { Text(reason).font(.footnote).foregroundStyle(.orange) }
                    }
                } header: {
                    Eyebrow("Companion server")
                } footer: {
                    Text("Running Sous Chef at home? Connect it to keep this app and your web kitchen in sync. The app keeps working offline and catches up when it can reach your server.")
                }

                Section {
                    LabeledContent("In use") { AIEngineBadge() }
                    LabeledContent("Private Cloud Compute", value: ai.privateCloudStatus)
                    LabeledContent("On-device model", value: ai.onDeviceStatus)
                    Toggle("Prefer Private Cloud Compute", isOn: $ai.preferPrivateCloud)
                } header: {
                    Eyebrow("Apple Intelligence")
                } footer: {
                    Text("Recipe ideas, reading recipes and aisle sorting use Apple's models. Private Cloud Compute runs Apple's larger model on Apple silicon servers that don't keep your data. With a server connected and no Apple Intelligence, Sous Chef uses the AI provider set up on your server.")
                }

                Section {
                    Toggle(isOn: $offEnabled) { Label("Open Food Facts lookups", systemImage: "barcode") }
                        .onChange(of: offEnabled) { _, value in OpenFoodFacts.enabled = value }
                    TextField("Community address (https://…convex.site)", text: $communityURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit { CommunityService.directURL = communityURL.trimmingCharacters(in: .whitespaces) }
                } header: {
                    Eyebrow("Services")
                } footer: {
                    Text("Barcode lookups send only the barcode to Open Food Facts. The community address is only needed without a connected server.")
                }

                Section {
                    Button { exportRecipes() } label: { Label("Export recipes", systemImage: "square.and.arrow.up") }
                    Button { importing = true } label: { Label("Import recipes", systemImage: "square.and.arrow.down") }
                    if let message { Text(message).font(.footnote).foregroundStyle(.secondary) }
                } header: {
                    Eyebrow("Your data")
                } footer: {
                    Text("Uses the same JSON format as the web app's recipe export.")
                }

                Section {
                    Link(destination: URL(string: "https://sous-chef-website.vercel.app")!) { Label("Website", systemImage: "globe") }
                    Link(destination: URL(string: "https://github.com/gamerg21/sous-chef")!) { Label("Source code (AGPL-3.0)", systemImage: "chevron.left.forwardslash.chevron.right") }
                    LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—")
                } header: {
                    Eyebrow("About")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done", role: .close) { dismiss() } } }
            .sheet(isPresented: $connecting) { ServerConnectView() }
            .sheet(item: $exportFile) { file in ShareSheet(items: [file.url]) }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                guard case .success(let url) = result else { return }
                let access = url.startAccessingSecurityScopedResource()
                defer { if access { url.stopAccessingSecurityScopedResource() } }
                do {
                    let count = try kitchen.importRecipes(from: Data(contentsOf: url))
                    message = "Imported \(count) recipe\(count == 1 ? "" : "s")."
                } catch {
                    message = error.localizedDescription
                }
            }
            .task { await server.refreshHouseholds() }
        }
    }

    private var iCloudStatus: String {
        if kitchen.usesICloud { return FileManager.default.ubiquityIdentityToken == nil ? "On · sign in to iCloud to sync" : "On" }
        return "Off"
    }

    private func exportRecipes() {
        do {
            let data = try kitchen.exportRecipes()
            let url = FileManager.default.temporaryDirectory.appending(path: "sous-chef-recipes-\(Date.now.formatted(.iso8601.year().month().day())).json")
            try data.write(to: url)
            exportFile = ExportFile(url: url)
        } catch {
            message = error.localizedDescription
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
                Button("Connect anyway", role: .destructive) { Task { await connect() } }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This address uses plain HTTP outside your home network, so your password could be seen in transit. Use an https:// address if your server has one.")
            }
            .interactiveDismissDisabled(working)
        }
    }

    private func connect() async {
        working = true
        error = nil
        defer { working = false }
        do {
            try await kitchen.server.connect(address: address, email: email, password: password, createAccount: createAccount, name: name.nilIfEmpty)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
