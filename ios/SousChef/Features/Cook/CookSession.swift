import Foundation
import Observation

/// Where a cook is in a recipe: the page showing, the ingredients gathered
/// and the timers started. Cook mode edits it and `CookSessionStore` keeps it.
nonisolated struct CookProgress: Codable, Hashable, Sendable {
    /// 0 is the ingredients, then a page for each step, then finishing up.
    var page = 0
    var gathered: Set<UUID> = []
    var timers: [CookTimer] = []
    /// The finish page's "Add them to the shopping list" switch.
    var addMissing = true
}

/// One recipe being cooked. It outlives cook mode's screen, so closing cook
/// mode, or the app, sets the recipe aside instead of losing the cook's place
/// and timers.
nonisolated struct CookSession: Codable, Hashable, Identifiable, Sendable {
    var id = UUID()
    var recipeID: UUID
    /// Kept with the session so the resume bar and the timers' alerts don't
    /// need the recipe.
    var recipeTitle: String
    var stepCount: Int
    /// The planned meal being cooked, when cook mode was opened from the plan.
    var mealID: UUID?
    var scale: Double
    var progress = CookProgress()
    /// The pantry has been updated, so closing cook mode ends the session.
    var isCooked = false
    var touchedAt = Date()

    /// How long a recipe set aside stays resumable after it was last touched
    /// or its last timer finished.
    static let shelfLife: TimeInterval = 12 * 3600

    /// Whether closing cook mode should keep the session. Opening a recipe
    /// and reading its first step isn't worth a reminder to resume.
    var isWorthKeeping: Bool {
        !isCooked && (progress.page > 1 || !progress.gathered.isEmpty || !progress.timers.isEmpty)
    }

    /// Whether the session was set aside so long ago that the meal is over.
    func isAbandoned(at now: Date) -> Bool {
        let last = progress.timers.map(\.ends).reduce(touchedAt, max)
        return now.timeIntervalSince(last) > Self.shelfLife
    }

    /// "Ingredients", "Step 3 of 8" or "Finishing up".
    var place: String {
        if progress.page <= 0 { return "Ingredients" }
        if progress.page > stepCount { return "Finishing up" }
        return "Step \(progress.page) of \(stepCount)"
    }

    /// Timers still counting down.
    func runningTimers(at now: Date) -> [CookTimer] {
        progress.timers.filter { !$0.isDone(at: now) }
    }
}

/// Keeps the recipe being cooked while cook mode is closed and between
/// launches, and says when cook mode is on screen. `RootView` presents cook
/// mode from here, so every "Cook" button, the resume bar, a timer's
/// notification and the Live Activity all lead to the same session.
///
/// One recipe is in flight at a time. Starting another asks first (`waiting`).
@Observable
final class CookSessionStore {
    /// `-uiTesting` keeps the session in memory, like the kitchen.
    static let shared = CookSessionStore(defaults: ProcessInfo.processInfo.arguments.contains("-uiTesting") ? nil : .standard)

    nonisolated static let defaultsKey = "cook.session"

    /// The recipe in flight, on screen or set aside.
    private(set) var session: CookSession?
    /// The session cook mode is showing; nil while it's set aside.
    private(set) var showing: UUID?
    /// A recipe asked for while a different one was in flight, until the cook
    /// says which of the two to cook.
    private(set) var waiting: CookSession?

    @ObservationIgnored private let defaults: UserDefaults?
    @ObservationIgnored private let now: () -> Date
    /// Mirrors the timers to their Live Activity, notifications and alarms.
    @ObservationIgnored private let syncAlerts: (_ recipeTitle: String, _ timers: [CookTimer]) -> Void
    /// Wakes when the next timer finishes, to move it behind the running ones.
    @ObservationIgnored private var watcher: Task<Void, Never>?
    /// Cook mode was on screen when the app last quit.
    @ObservationIgnored private var wasShowing = false

    /// What's saved between launches.
    private nonisolated struct Saved: Codable {
        var session: CookSession
        var showing: Bool
    }

    init(defaults: UserDefaults? = .standard, now: @escaping () -> Date = { .now },
         syncAlerts: @escaping (String, [CookTimer]) -> Void = { CookTimerAlerts.shared.sync(recipeTitle: $0, timers: $1) }) {
        self.defaults = defaults
        self.now = now
        self.syncAlerts = syncAlerts
        if let data = defaults?.data(forKey: Self.defaultsKey), let saved = try? JSONDecoder().decode(Saved.self, from: data) {
            session = saved.session
            wasShowing = saved.showing
        }
    }

    // MARK: Starting and resuming

    /// Opens cook mode on a recipe. The recipe already in flight picks up
    /// where the cook left it; a different one waits for the cook to choose.
    func start(_ request: CookSession) {
        if let current = session, current.recipeID == request.recipeID {
            // Started from the recipe, then from the plan: the same cooking,
            // which should mark that meal cooked.
            if current.mealID == nil, let meal = request.mealID {
                session?.mealID = meal
                session?.scale = request.scale
                save()
            }
            resume()
        } else if let current = session, current.isWorthKeeping {
            waiting = request
        } else {
            startOver(with: request)
        }
    }

    /// Brings cook mode back to the recipe in flight. False when there's none.
    @discardableResult
    func resume() -> Bool {
        guard let session else { return false }
        waiting = nil
        showing = session.id
        save()
        return true
    }

    /// Ends the recipe in flight, if any, and opens cook mode on another.
    func startOver(with request: CookSession) {
        var next = request
        next.touchedAt = now()
        waiting = nil
        session = next
        showing = next.id
        save()
        alert()
    }

    /// The cook kept the recipe in flight instead of the one asked for.
    func dropWaiting() {
        waiting = nil
    }

    // MARK: While cooking

    /// Cook mode's latest page, gathered ingredients and timers.
    func update(_ progress: CookProgress, for id: UUID) {
        guard var current = session, current.id == id, current.progress != progress else { return }
        let timersChanged = current.progress.timers != progress.timers
        current.progress = progress
        current.touchedAt = now()
        session = current
        save()
        if timersChanged { alert() }
    }

    /// The pantry was updated: the cooking is done, though cook mode and its
    /// timers stay until it's closed.
    func markCooked(_ id: UUID) {
        guard session?.id == id else { return }
        session?.isCooked = true
        save()
    }

    /// Cook mode closed. A recipe the cook got somewhere in stays in flight;
    /// one that was only looked at, or is already cooked, ends.
    func setAside() {
        showing = nil
        if let session, !session.isWorthKeeping {
            end()
        } else {
            save()
        }
    }

    /// Ends the recipe in flight: its place is forgotten and its timers stop.
    func end() {
        guard session != nil else { return }
        session = nil
        showing = nil
        save()
        alert()
    }

    // MARK: Launch and foreground

    /// At launch, before anything shows: forgets a saved session that can't
    /// be picked up again, and goes back into cook mode if the app quit there.
    func restore(recipeExists: (UUID) -> Bool) {
        guard let saved = session else { return }
        if !saved.isWorthKeeping || saved.isAbandoned(at: now()) || !recipeExists(saved.recipeID) {
            session = nil
            save()
        } else if wasShowing {
            showing = saved.id
        }
        wasShowing = false
    }

    /// Back in the foreground: forgets a recipe set aside long ago, and moves
    /// timers that finished in the meantime behind the running ones.
    func refresh() {
        guard let session else { return }
        if showing == nil, session.isAbandoned(at: now()) {
            end()
        } else if !session.progress.timers.isEmpty {
            alert()
        }
    }

    // MARK: Alerts and saving

    private func alert() {
        syncAlerts(session?.recipeTitle ?? "", session?.progress.timers ?? [])
        watchTimers()
    }

    /// The Live Activity lists finished timers after the running ones, which
    /// takes an update the moment each one finishes.
    private func watchTimers() {
        watcher?.cancel()
        watcher = nil
        let current = now()
        guard let next = session?.runningTimers(at: current).map(\.ends).min() else { return }
        watcher = Task { [weak self] in
            try? await Task.sleep(for: .seconds(next.timeIntervalSince(current) + 0.25))
            guard !Task.isCancelled else { return }
            self?.alert()
        }
    }

    private func save() {
        guard let defaults else { return }
        if let session, let data = try? JSONEncoder().encode(Saved(session: session, showing: showing == session.id)) {
            defaults.set(data, forKey: Self.defaultsKey)
        } else {
            defaults.removeObject(forKey: Self.defaultsKey)
        }
    }
}

extension CookSessionStore {
    /// Opens cook mode on a recipe, or on a planned meal of it at that meal's
    /// servings.
    func start(_ recipe: Recipe, scale: Double = 1, meal: PlannedMeal? = nil) {
        start(CookSession(recipeID: recipe.uuid, recipeTitle: recipe.title, stepCount: recipe.steps.count,
                          mealID: meal?.uuid, scale: scale))
    }
}
