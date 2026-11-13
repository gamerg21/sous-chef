import SwiftUI

/// The screens the Community tab pushes.
enum CommunityRoute: Hashable {
    /// A recipe from a list, whose listing fills the page while the rest loads.
    case recipe(Community.Listing)
    /// A recipe known only by its ID, such as from a share link.
    case recipeID(String)
    case cook(Community.Author)
    /// Saved recipes with a newer version in the community.
    case updates
}

extension View {
    func communityDestinations() -> some View {
        navigationDestination(for: CommunityRoute.self) { route in
            switch route {
            case .recipe(let listing): CommunityRecipeView(id: listing.id, preview: listing)
            case .recipeID(let id): CommunityRecipeView(id: id, preview: nil)
            case .cook(let author): CookProfileView(author: author)
            case .updates: CommunityUpdatesView()
            }
        }
    }
}
