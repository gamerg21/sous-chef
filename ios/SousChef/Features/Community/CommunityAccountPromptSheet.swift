import AuthenticationServices
import SwiftUI

/// Shown when liking, following or rating needs a community account: Sign in
/// with Apple, or with a connected server, where that account is connected.
struct CommunityAccountPromptSheet: View {
    let prompt: CommunitySocial.AccountPrompt
    @Environment(\.dismiss) private var dismiss
    @State private var signInError: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    Image(systemName: prompt == .signIn ? "person.crop.circle.badge.plus" : "server.rack")
                        .font(.largeTitle.scaled(by: 1.5))
                        .foregroundStyle(Color.brand)
                        .accessibilityHidden(true)
                        .padding(.top, 12)
                    Text(prompt == .signIn ? "Join in with a community account" : "Connect on your server")
                        .font(.title2.bold())
                        .multilineTextAlignment(.center)
                    Text(prompt == .signIn
                         ? "Sign in to like recipes, follow cooks and share how a recipe turned out. Browsing and saving never need an account."
                         : "Likes, follows and ratings use the community account connected to your Sous Chef server. Open your server's web app, go to Community → Connect, then come back.")
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                    if prompt == .signIn {
                        CommunitySignInButton(error: $signInError, label: .continue) { dismiss() }
                        if let signInError {
                            Text(signInError).font(.footnote).foregroundStyle(.orange).multilineTextAlignment(.center)
                        }
                        Text("Sous Chef asks Apple only for your name, which is shown with what you share. You can change it in Settings.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    } else {
                        Button { dismiss() } label: {
                            Text("OK").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 4)
                        }
                        .buttonStyle(.glassProminent)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
            .scrollBounceBehavior(.basedOnSize)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Not now", role: .cancel) { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
