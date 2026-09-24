import SwiftData
import SwiftUI

struct OnboardingView: View {
    let onFinish: () -> Void
    @Environment(Kitchen.self) private var kitchen
    @State private var connecting = false
    /// `-onboardingPage 1` opens the iCloud page directly, for screenshots.
    @State private var page = UserDefaults.standard.integer(forKey: "onboardingPage")
    @State private var syncWithICloud = Kitchen.iCloudPreferred

    var body: some View {
        Group {
            if page == 0 { welcome } else { iCloudConsent }
        }
        .padding(28)
        .animation(.snappy, value: page)
        .sheet(isPresented: $connecting, onDismiss: {
            if kitchen.server.isConnected { page = 1 }
        }) {
            ServerConnectView()
        }
    }

    private var welcome: some View {
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
                    page = 1
                } label: {
                    Text("Start cooking").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
                }
                .buttonStyle(.glassProminent)
                .accessibilityIdentifier("startOnboarding")
                Button("I run Sous Chef at home — connect my server") { connecting = true }
                    .font(.callout)
            }
        }
        .transition(.move(edge: .leading).combined(with: .opacity))
    }

    private var iCloudConsent: some View {
        VStack(spacing: 28) {
            Spacer()
            Image(systemName: "icloud.fill")
                .font(.system(size: 64))
                .foregroundStyle(Color.brand)
                .symbolEffect(.bounce, value: syncWithICloud)
            VStack(spacing: 8) {
                Text("Keep your kitchen in iCloud").font(.system(.title, design: .rounded, weight: .bold))
                    .multilineTextAlignment(.center)
                Text("Sync your pantry, recipes and shopping list across your iPhone and iPad.")
                    .font(.title3)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 18) {
                feature("lock.icloud", "Private to you", "Stored in your own iCloud. Sous Chef has no servers and can't see it.")
                feature("arrow.triangle.2.circlepath.icloud", "Always up to date", "Changes on one device show up on the others.")
                feature("gearshape", "Your choice", "Turn it off, or remove your kitchen from iCloud, anytime in Settings.")
            }
            .padding(.horizontal, 8)
            Toggle(isOn: $syncWithICloud) { Label("Sync with iCloud", systemImage: "icloud").font(.headline) }
                .padding(16)
                .background(.background.secondary, in: .rect(cornerRadius: 20, style: .continuous))
                .disabled(!kitchen.iCloudAvailable)
                .accessibilityIdentifier("onboardingICloud")
            Spacer()
            Button {
                kitchen.setICloud(syncWithICloud)
                onFinish()
            } label: {
                Text("Continue").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
            }
            .buttonStyle(.glassProminent)
            .accessibilityIdentifier("finishOnboarding")
        }
        .transition(.move(edge: .trailing).combined(with: .opacity))
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

/// Launch with `-seedSample` to fill an empty kitchen for screenshots and
/// demos. Add `-samplePhotos <folder>` to attach recipe photos named after
/// each recipe's `photo` key (e.g. pasta.jpg).
enum SampleKitchen {
    static func seedIfRequested(into kitchen: Kitchen) {
        guard ProcessInfo.processInfo.arguments.contains("-seedSample"), kitchen.fetch(PantryItem.self).isEmpty else { return }
        UserDefaults.standard.set(true, forKey: "onboarding.done")
        let photoFolder = UserDefaults.standard.string(forKey: "samplePhotos").map { URL(fileURLWithPath: $0) }
        let day: (Int) -> Date = { Calendar.current.date(byAdding: .day, value: $0, to: .now)! }
        let pantry: [(String, String?, StorageLocation, Double, String, String?, Date?)] = [
            ("Penne", "Barilla", .pantry, 500, "g", "Pasta & Noodles", nil),
            ("Tomatoes", nil, .fridge, 4, "each", "Produce", day(2)),
            ("Olive oil", "California Olive Ranch", .pantry, 500, "ml", "Condiments & Sauces", nil),
            ("Garlic", nil, .pantry, 6, "clove", "Produce", day(12)),
            ("Parmesan", "BelGioioso", .fridge, 120, "g", "Dairy", day(9)),
            ("Eggs", "Vital Farms", .fridge, 12, "each", "Dairy", day(14)),
            ("Spinach", nil, .fridge, 150, "g", "Produce", day(1)),
            ("Whole milk", "Fairlife", .fridge, 1, "l", "Dairy", day(6)),
            ("Chicken", "Wild Fork", .freezer, 1.5, "kg", "Meat & Seafood", day(60)),
            ("Potatoes", nil, .pantry, 1, "kg", "Produce", day(20)),
            ("Rosemary", nil, .fridge, 1, "bunch", "Spices & Seasonings", day(5)),
            ("Flour", "King Arthur", .pantry, 2, "kg", "Grains & Rice", nil),
            ("Butter", "Kerrygold", .fridge, 250, "g", "Dairy", day(20)),
            ("Mixed greens", nil, .fridge, 200, "g", "Produce", day(3)),
            ("Coconut milk", "Thai Kitchen", .pantry, 2, "can", "Canned Goods", nil),
            ("Green curry paste", "Mae Ploy", .fridge, 200, "g", "Condiments & Sauces", day(90)),
        ]
        for (name, brand, location, quantity, unit, category, expiry) in pantry {
            let item = PantryItem(name: name, location: location, quantity: quantity, unit: unit)
            item.brand = brand
            item.category = category
            item.expiresOn = expiry
            kitchen.context.insert(item)
        }
        func recipe(_ title: String, photo: String, _ summary: String, _ minutes: Int, _ servings: Int, _ tags: [String],
                    favorite: Bool = false, _ lines: [String], _ steps: [String]) {
            var draft = RecipeDraft(title: title)
            draft.summary = summary
            draft.totalTimeMinutes = minutes
            draft.servings = servings
            draft.tags = tags
            draft.ingredients = lines.map(IngredientParser.parse)
            draft.steps = steps.map { RecipeStep(text: $0) }
            draft.photo = photoFolder.flatMap { try? Data(contentsOf: $0.appending(path: "\(photo).jpg")) }.flatMap { ImageTools.compressed($0) }
            let saved = kitchen.save(draft)
            saved.favorited = favorite
        }
        recipe("Penne all'arrabbiata", photo: "pasta", "Bright, garlicky and on the table in 20 minutes.", 20, 2, ["dinner", "quick", "vegetarian"], favorite: true,
               ["200 g Penne", "2 Tomatoes", "2 clove Garlic", "15 ml Olive oil", "30 g Parmesan"],
               ["Cook the penne in well-salted boiling water for 10 minutes.", "Meanwhile, warm the olive oil and gently fry the sliced garlic for 1 minute.",
                "Add the chopped tomatoes and simmer for 5 minutes.", "Toss with the pasta and top with grated Parmesan."])
        recipe("Thai green curry", photo: "curry", "Creamy, fragrant and ready in half an hour.", 30, 4, ["dinner", "spicy"], favorite: true,
               ["2 tbsp Green curry paste", "1 can Coconut milk", "500 g Chicken", "1 bunch Thai basil", "1 Red chili"],
               ["Fry the curry paste in a splash of coconut milk for 2 minutes.", "Add the chicken and cook for 5 minutes.",
                "Pour in the rest of the coconut milk and simmer for 15 minutes.", "Finish with Thai basil and sliced chili."])
        recipe("Fluffy pancakes", photo: "pancakes", "Weekend-morning classic.", 25, 4, ["breakfast", "sweet"],
               ["200 g Flour", "2 Eggs", "300 ml Whole milk", "30 g Butter", "1 tbsp baking powder"],
               ["Whisk the flour and baking powder.", "Beat in the eggs, milk and melted butter until smooth.", "Cook ladlefuls in a hot pan for 2 minutes per side."])
        recipe("Spinach & parmesan omelette", photo: "omelette", "A fast, protein-packed breakfast.", 10, 1, ["breakfast", "quick"],
               ["3 Eggs", "50 g Spinach", "20 g Parmesan", "10 g Butter"],
               ["Whisk the eggs with a pinch of salt.", "Melt the butter and wilt the spinach for 1 minute.", "Pour in the eggs and cook for 3 minutes, then fold with the Parmesan."])
        recipe("Lemon herb roast", photo: "roast", "Sunday roast with crispy rosemary potatoes.", 90, 4, ["dinner", "comfort food"],
               ["1.2 kg Chicken", "800 g Potatoes", "2 Lemons", "1 bunch Rosemary", "6 clove Garlic", "45 ml Olive oil"],
               ["Heat the oven to 200°C.", "Toss the potatoes with olive oil, rosemary and garlic.", "Roast the chicken on top with halved lemons for 75 minutes.", "Rest for 10 minutes before carving."])
        recipe("Garden salad", photo: "salad", "Crisp greens with a lemony dressing.", 10, 2, ["lunch", "vegetarian", "quick"],
               ["150 g Mixed greens", "1 Carrot", "30 ml Olive oil", "1 Lemon"],
               ["Wash and dry the greens.", "Shave the carrot into ribbons.", "Whisk olive oil and lemon juice, then toss."])
        let shopping: [(String, Double?, String?, String)] = [
            ("Lemons", 3, "each", "Produce"), ("Thai basil", 1, "bunch", "Produce"), ("Red chili", 2, "each", "Produce"),
            ("Carrots", 500, "g", "Produce"), ("Greek yogurt", 500, "g", "Dairy"), ("Sourdough bread", 1, "each", "Bakery"),
            ("Sparkling water", 6, "each", "Beverages"),
        ]
        for (name, quantity, unit, category) in shopping {
            let item = ShoppingItem(name: name, quantity: quantity, unit: unit)
            item.category = category
            kitchen.context.insert(item)
        }
        try? kitchen.context.save()
    }
}
