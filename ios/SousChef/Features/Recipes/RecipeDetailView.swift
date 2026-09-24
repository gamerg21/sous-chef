import SwiftData
import SwiftUI

struct RecipeDetailView: View {
    @Bindable var recipe: Recipe
    @Environment(Kitchen.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @Query private var pantry: [PantryItem]
    @State private var servings: Int?
    @State private var editing = false
    @State private var cooking = false
    @State private var chatting = false
    @State private var publishing = false
    @State private var confirmDelete = false
    @State private var toast: String?

    private var plan: CookingPlan {
        CookingPlanner.plan(ingredients: recipe.ingredients, stock: pantry.map { StockLine(id: $0.uuid, name: $0.name, quantity: $0.quantity, unit: $0.unit, expiresOn: $0.expiresOn) })
    }

    private var scale: Double {
        guard let base = recipe.servings, base > 0, let servings else { return 1 }
        return Double(servings) / Double(base)
    }

    var body: some View {
        let plan = plan
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                RecipeImage(data: recipe.photo)
                    .frame(height: 280)
                    .frame(maxWidth: .infinity)
                    .clipped()
                    .overlay(alignment: .bottom) {
                        LinearGradient(colors: [.clear, Color(uiColor: .systemBackground)], startPoint: .center, endPoint: .bottom)
                    }
                    .padding(.bottom, -60)

                VStack(alignment: .leading, spacing: 20) {
                    header
                    readiness(plan)
                    ingredients(plan)
                    steps
                    RecipeNutritionCard(recipe: recipe, pantry: pantry)
                    if let notes = recipe.notes?.nilIfEmpty {
                        Card {
                            Eyebrow("Notes", systemImage: "note.text")
                            Text(notes).font(.callout)
                        }
                    }
                    if let source = recipe.sourceURL, let url = URL(string: source) {
                        Link(destination: url) {
                            Label(url.host ?? source, systemImage: "safari")
                                .font(.footnote)
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 100)
            }
        }
        .ignoresSafeArea(edges: .top)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbar }
        .safeAreaInset(edge: .bottom) {
            Button {
                cooking = true
            } label: {
                Label("Start cooking", systemImage: "flame.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.glassProminent)
            .padding(.horizontal)
            .padding(.bottom, 8)
            .accessibilityIdentifier("startCooking")
        }
        .overlay(alignment: .top) {
            if let toast {
                Text(toast)
                    .font(.callout.weight(.medium))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .glassEffect(.regular, in: .capsule)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .padding(.top, 8)
            }
        }
        .sheet(isPresented: $editing) {
            RecipeEditorView(draft: kitchen.draft(from: recipe), recipe: recipe)
        }
        .fullScreenCover(isPresented: $cooking) {
            CookModeView(recipe: recipe, scale: scale)
        }
        .sheet(isPresented: $chatting) {
            RecipeChatView(recipe: recipe)
        }
        .sheet(isPresented: $publishing) {
            PublishRecipeSheet(recipe: recipe)
        }
        .confirmationDialog("Delete \(recipe.title)?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete recipe", role: .destructive) {
                kitchen.delete(recipe)
                kitchen.changed()
                dismiss()
            }
        }
        .onAppear { servings = servings ?? recipe.servings }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(recipe.title)
                .heroTitle()
                .fixedSize(horizontal: false, vertical: true)
            if let summary = recipe.summary?.nilIfEmpty {
                Text(summary).font(.body).foregroundStyle(.secondary)
            }
            if let author = recipe.communityAuthor {
                Label("From the community · \(author)", systemImage: "person.2").font(.caption).foregroundStyle(.secondary)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    if let minutes = recipe.totalTimeMinutes { Chip(text: "\(minutes) min", systemImage: "timer") }
                    if let calories = recipe.caloriesKcal { Chip(text: "\(Int(calories)) kcal", systemImage: "flame", tint: .orange) }
                    if let cooked = recipe.lastCookedAt { Chip(text: "Cooked \(cooked.formatted(.relative(presentation: .named)))", systemImage: "checkmark", tint: .secondary) }
                    ForEach(recipe.tags, id: \.self) { Chip(text: $0, systemImage: "number", tint: .secondary) }
                }
            }
            .scrollClipDisabled()
        }
    }

    private func readiness(_ plan: CookingPlan) -> some View {
        Card {
            HStack(alignment: .firstTextBaseline) {
                Eyebrow("From your pantry", systemImage: "cabinet")
                Spacer()
                ReadinessBadge(plan: plan, total: recipe.ingredients.count)
            }
            let total = recipe.ingredients.count
            if total == 0 {
                Text("Add ingredients to see what you have.").foregroundStyle(.secondary)
            } else {
                Gauge(value: Double(total - plan.missingIngredients.count), in: 0...Double(total)) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
                .gaugeStyle(.linearCapacity)
                .tint(plan.missingIngredients.isEmpty ? Color.brand : .orange)
                Text(plan.missingIngredients.isEmpty ? "You have everything for this recipe." : "You have \(total - plan.missingIngredients.count) of \(total) ingredients.")
                    .font(.callout)
                if !plan.missingIngredients.isEmpty {
                    Button {
                        let added = kitchen.addShortages(for: recipe, missing: plan.missingIngredients)
                        show(added == 0 ? "Already on your list" : "Added \(added) to your shopping list")
                    } label: {
                        Label("Add missing to shopping list", systemImage: "cart.badge.plus")
                    }
                    .buttonStyle(.glass)
                }
                ForEach(plan.checks, id: \.self) { check in
                    Label("\(check.name): \(check.reason)", systemImage: "exclamationmark.circle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func ingredients(_ plan: CookingPlan) -> some View {
        let missing = Set(plan.missingIngredients.map { normalizeName($0.name) })
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Eyebrow("Ingredients", systemImage: "list.bullet")
                Spacer()
                if let base = recipe.servings, base > 0 {
                    Stepper(value: Binding(get: { servings ?? base }, set: { servings = $0 }), in: 1...48) {
                        Text("\(servings ?? base) servings").font(.caption.weight(.medium)).monospacedDigit()
                    }
                    .fixedSize()
                }
            }
            Card(padding: 14) {
                ForEach(recipe.ingredients) { ingredient in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Image(systemName: missing.contains(normalizeName(ingredient.name)) ? "circle" : "checkmark.circle.fill")
                            .foregroundStyle(missing.contains(normalizeName(ingredient.name)) ? Color.secondary : Color.brand)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(ingredient.name).font(.body)
                            if let note = ingredient.note?.nilIfEmpty { Text(note).font(.caption).foregroundStyle(.secondary) }
                        }
                        Spacer()
                        Text(Units.amount(ingredient.quantity.map { $0 * scale }, ingredient.unit))
                            .font(.callout.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                    if ingredient.id != recipe.ingredients.last?.id { Divider() }
                }
                if recipe.ingredients.isEmpty { Text("No ingredients yet.").foregroundStyle(.secondary) }
            }
        }
    }

    private var steps: some View {
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow("Steps", systemImage: "list.number")
            ForEach(Array(recipe.steps.enumerated()), id: \.element.id) { index, step in
                HStack(alignment: .top, spacing: 12) {
                    Text("\(index + 1)")
                        .font(.subheadline.weight(.bold).monospacedDigit())
                        .foregroundStyle(Color.brand)
                        .frame(width: 28, height: 28)
                        .background(Color.brandSoft, in: .circle)
                    Text(step.text).font(.body).fixedSize(horizontal: false, vertical: true)
                }
            }
            if recipe.steps.isEmpty { Text("No steps yet.").foregroundStyle(.secondary) }
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            Button {
                recipe.favorited.toggle()
                kitchen.changed()
            } label: {
                Label("Favorite", systemImage: recipe.favorited ? "heart.fill" : "heart")
            }
            .tint(recipe.favorited ? .pink : nil)
            .symbolEffect(.bounce, value: recipe.favorited)
            Menu {
                Button { editing = true } label: { Label("Edit", systemImage: "pencil") }
                if kitchen.ai.isAvailable {
                    Button { chatting = true } label: { Label("Ask Sous Chef", systemImage: "apple.intelligence") }
                }
                ShareLink(item: shareText, subject: Text(recipe.title)) { Label("Share", systemImage: "square.and.arrow.up") }
                if kitchen.server.isConnected || CommunityService.isConfigured {
                    Button { publishing = true } label: { Label("Publish to community", systemImage: "person.2.badge.plus") }
                }
                Divider()
                Button(role: .destructive) { confirmDelete = true } label: { Label("Delete", systemImage: "trash") }
            } label: {
                Label("More", systemImage: "ellipsis")
            }
        }
    }

    private var shareText: String {
        var lines = [recipe.title, ""]
        if let summary = recipe.summary { lines += [summary, ""] }
        lines.append("Ingredients")
        lines += recipe.ingredients.map { "• \(Units.amount($0.quantity, $0.unit)) \($0.name)".replacingOccurrences(of: "•  ", with: "• ") }
        lines += ["", "Steps"]
        lines += recipe.steps.enumerated().map { "\($0.offset + 1). \($0.element.text)" }
        if let source = recipe.sourceURL { lines += ["", source] }
        lines += ["", "Shared from Sous Chef"]
        return lines.joined(separator: "\n")
    }

    private func show(_ message: String) {
        withAnimation(.snappy) { toast = message }
        Task {
            try? await Task.sleep(for: .seconds(2.2))
            withAnimation(.snappy) { toast = nil }
        }
    }
}

struct RecipeNutritionCard: View {
    let recipe: Recipe
    let pantry: [PantryItem]

    var body: some View {
        let computed = RecipeNutrition.compute(ingredients: recipe.ingredients, pantry: pantry, servings: recipe.servings)
        let stated = [recipe.caloriesKcal, recipe.proteinGrams, recipe.carbsGrams, recipe.fatGrams].contains { $0 != nil }
        if stated || !computed.counted.isEmpty {
            Card {
                Eyebrow(stated ? "Nutrition per serving" : "Estimated from your pantry", systemImage: "chart.bar")
                HStack {
                    macro("Calories", stated ? recipe.caloriesKcal : computed.perServing.energyKcal, "kcal")
                    macro("Protein", stated ? recipe.proteinGrams : computed.perServing.proteinG, "g")
                    macro("Carbs", stated ? recipe.carbsGrams : computed.perServing.carbsG, "g")
                    macro("Fat", stated ? recipe.fatGrams : computed.perServing.fatG, "g")
                }
                if !stated {
                    Text("Counted \(computed.counted.count) of \(recipe.ingredients.count) ingredients\(computed.approximate ? " · volumes assume water density" : "").")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func macro(_ label: String, _ value: Double?, _ unit: String) -> some View {
        VStack(spacing: 2) {
            Text(value.map { $0.formatted(.number.precision(.fractionLength(0))) } ?? "—")
                .font(.title3.weight(.bold).monospacedDigit())
            Text("\(label)\(value == nil ? "" : " · \(unit)")").font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}
