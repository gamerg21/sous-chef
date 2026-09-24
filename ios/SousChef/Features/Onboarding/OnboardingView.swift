import SwiftData
import SwiftUI

struct OnboardingView: View {
    let onFinish: () -> Void
    @Environment(Kitchen.self) private var kitchen
    @State private var connecting = false

    var body: some View {
        VStack(spacing: 28) {
            Spacer()
            Image("Logo")
                .resizable()
                .frame(width: 112, height: 112)
                .clipShape(.rect(cornerRadius: 26, style: .continuous))
                .shadow(color: .black.opacity(0.2), radius: 18, y: 8)
            VStack(spacing: 8) {
                Text("Sous Chef").font(.system(size: 40, weight: .bold, design: .rounded))
                Text("Know what's in your kitchen. Cook what you have.")
                    .font(.title3)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 18) {
                feature("cabinet", "Pantry, fridge & freezer", "Track amounts and expiry dates, or scan a barcode.")
                feature("frying.pan", "Cook what you have", "See recipes you can make now; cooking updates your pantry.")
                feature("apple.intelligence", "Apple Intelligence", "Recipe ideas from your pantry, privately.")
                feature("icloud", "Yours, everywhere", "Stored on your devices and your iCloud — or your own server.")
            }
            .padding(.horizontal, 8)
            Spacer()
            VStack(spacing: 12) {
                Button {
                    onFinish()
                } label: {
                    Text("Start cooking").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
                }
                .buttonStyle(.glassProminent)
                .accessibilityIdentifier("startOnboarding")
                Button("I run Sous Chef at home — connect my server") { connecting = true }
                    .font(.callout)
            }
        }
        .padding(28)
        .sheet(isPresented: $connecting, onDismiss: {
            if kitchen.server.isConnected { onFinish() }
        }) {
            ServerConnectView()
        }
    }

    private func feature(_ symbol: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            IconBadge(systemImage: symbol, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(detail).font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }
}

/// Launch with `-seedSample` to fill an empty kitchen for screenshots and demos.
enum SampleKitchen {
    static func seedIfRequested(into kitchen: Kitchen) {
        guard ProcessInfo.processInfo.arguments.contains("-seedSample"), kitchen.fetch(PantryItem.self).isEmpty else { return }
        UserDefaults.standard.set(true, forKey: "onboarding.done")
        let day: (Int) -> Date = { Calendar.current.date(byAdding: .day, value: $0, to: .now)! }
        let pantry: [(String, StorageLocation, Double, String, String?, Date?)] = [
            ("Pasta", .pantry, 500, "g", "Pasta & Noodles", nil),
            ("Tomatoes", .fridge, 4, "each", "Produce", day(2)),
            ("Olive oil", .pantry, 500, "ml", "Condiments & Sauces", nil),
            ("Garlic", .pantry, 6, "clove", "Produce", day(12)),
            ("Parmesan", .fridge, 120, "g", "Dairy", day(9)),
            ("Eggs", .fridge, 6, "each", "Dairy", day(14)),
            ("Spinach", .fridge, 150, "g", "Produce", day(1)),
            ("Chicken thighs", .freezer, 800, "g", "Meat & Seafood", day(60)),
            ("Rice", .pantry, 1, "kg", "Grains & Rice", nil),
            ("Butter", .fridge, 200, "g", "Dairy", day(20)),
        ]
        for (name, location, quantity, unit, category, expiry) in pantry {
            let item = PantryItem(name: name, location: location, quantity: quantity, unit: unit)
            item.category = category
            item.expiresOn = expiry
            kitchen.context.insert(item)
        }
        func recipe(_ title: String, _ summary: String, _ minutes: Int, _ servings: Int, _ tags: [String], _ lines: [String], _ steps: [String]) {
            var draft = RecipeDraft(title: title)
            draft.summary = summary
            draft.totalTimeMinutes = minutes
            draft.servings = servings
            draft.tags = tags
            draft.ingredients = lines.map(IngredientParser.parse)
            draft.steps = steps.map { RecipeStep(text: $0) }
            kitchen.save(draft)
        }
        recipe("Weeknight tomato pasta", "Bright, garlicky and on the table in 20 minutes.", 20, 2, ["dinner", "quick", "vegetarian"],
               ["200 g Pasta", "2 Tomatoes", "2 clove Garlic", "15 ml Olive oil", "30 g Parmesan"],
               ["Cook the pasta in well-salted boiling water for 10 minutes.", "Meanwhile, warm the olive oil and gently fry the sliced garlic for 1 minute.",
                "Add the chopped tomatoes and simmer for 5 minutes.", "Toss with the pasta and top with grated Parmesan."])
        recipe("Spinach & parmesan omelette", "A fast, protein-packed breakfast.", 10, 1, ["breakfast", "quick"],
               ["3 Eggs", "50 g Spinach", "20 g Parmesan", "10 g Butter"],
               ["Whisk the eggs with a pinch of salt.", "Melt the butter and wilt the spinach for 1 minute.", "Pour in the eggs and cook for 3 minutes, then fold with the Parmesan."])
        recipe("Lemon herb chicken & rice", "One-pan comfort food.", 45, 4, ["dinner", "comfort food"],
               ["600 g Chicken thighs", "300 g Rice", "1 Lemon", "4 clove Garlic", "30 ml Olive oil", "750 ml Chicken stock"],
               ["Brown the chicken in olive oil for 6 minutes per side.", "Add garlic, rice and stock; bring to a simmer.", "Cover and bake at 190°C for 30 minutes.", "Finish with lemon juice."])
        let milk = ShoppingItem(name: "Milk", quantity: 1, unit: "l")
        milk.category = "Dairy"
        let lemons = ShoppingItem(name: "Lemons", quantity: 3, unit: "each")
        lemons.category = "Produce"
        kitchen.context.insert(milk)
        kitchen.context.insert(lemons)
        try? kitchen.context.save()
    }
}
