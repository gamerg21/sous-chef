import SwiftUI
import UniformTypeIdentifiers

/// Where the kitchen lives: iCloud, an optional companion server, and recipe
/// import and export.
struct SyncSettingsView: View {
    @Environment(Kitchen.self) private var kitchen
    @State private var confirmICloudDelete = false
    @State private var deletingICloud = false
    @State private var iCloudMessage: String?
    @State private var connecting = false
    @State private var exportFile: ExportFile?
    @State private var importing = false
    @State private var message: String?

    /// The summary on the Settings page: where the kitchen syncs to.
    static func summary(_ kitchen: Kitchen) -> String {
        if kitchen.server.isConnected { return URL(string: kitchen.server.address)?.host() ?? "Server" }
        return kitchen.usesICloud ? "iCloud" : "This device"
    }

    var body: some View {
        @Bindable var server = kitchen.server
        Form {
            Section {
                Toggle(isOn: Binding(get: { kitchen.usesICloud }, set: { kitchen.setICloud($0) })) {
                    Label("Sync with iCloud", systemImage: "icloud")
                }
                .disabled(!kitchen.iCloudAvailable || deletingICloud)
                LabeledContent("Status") {
                    HStack(spacing: 6) {
                        StatusDot(color: kitchen.usesICloud ? .green : .secondary)
                        Text(iCloudStatus)
                    }
                }
                if kitchen.iCloudAvailable {
                    Button(role: .destructive) { confirmICloudDelete = true } label: {
                        HStack {
                            Label("Remove kitchen from iCloud", systemImage: "icloud.slash")
                            if deletingICloud { Spacer(); ProgressView() }
                        }
                    }
                    .disabled(deletingICloud)
                }
                if let iCloudMessage { Text(iCloudMessage).font(.footnote).foregroundStyle(.secondary) }
            } header: {
                Eyebrow("iCloud")
            } footer: {
                Text(kitchen.usesICloud
                     ? "Your kitchen is stored on this device and in your private iCloud, so it follows you to your other Apple devices. Sous Chef has no servers of its own."
                     : "Your kitchen is stored only on this device. Turn on iCloud to keep it on your other Apple devices too.")
            }
            .confirmationDialog("Remove your kitchen from iCloud?", isPresented: $confirmICloudDelete, titleVisibility: .visible) {
                Button("Remove from iCloud", role: .destructive) { Task { await deleteICloudData() } }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This turns off iCloud sync and deletes your pantry, recipes and shopping list from iCloud. This device keeps its copy. Other devices using your iCloud will clear theirs the next time they sync.")
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
                Button { exportRecipes() } label: { Label("Export recipes", systemImage: "square.and.arrow.up") }
                Button { importing = true } label: { Label("Import recipes", systemImage: "square.and.arrow.down") }
                if let message { Text(message).font(.footnote).foregroundStyle(.secondary) }
            } header: {
                Eyebrow("Recipe backup")
            } footer: {
                Text("Uses the same JSON format as the web app's recipe export.")
            }
        }
        .navigationTitle("Sync and Storage")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $connecting) { ServerConnectView().kitchenEnvironment(kitchen) }
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

    private func deleteICloudData() async {
        deletingICloud = true
        defer { deletingICloud = false }
        do {
            try await kitchen.deleteICloudData()
            iCloudMessage = "Your kitchen was removed from iCloud. It's still on this device."
        } catch {
            iCloudMessage = "Couldn't reach iCloud: \(error.localizedDescription)"
        }
    }

    private var iCloudStatus: String {
        if !kitchen.iCloudAvailable { return "Not available in this build" }
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
