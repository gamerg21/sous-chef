import Foundation
import Testing
@testable import SousChef

/// Resuming a recipe: `CookSessionStore` keeps the cook's place and timers
/// while cook mode is closed and between launches.
@MainActor
struct CookSessionTests {
    private let start = Date(timeIntervalSinceReferenceDate: 800_000_000)

    /// A store on its own defaults and clock, recording what it tells the
    /// timers' alerts.
    private final class Bench {
        let defaults: UserDefaults
        var now: Date
        var alerts: [(title: String, timers: [CookTimer])] = []

        init(now: Date) {
            self.now = now
            let suite = "cook-session-tests-\(UUID().uuidString)"
            defaults = UserDefaults(suiteName: suite)!
            defaults.removePersistentDomain(forName: suite)
        }

        /// A new store reading what the last one saved, as after a relaunch.
        func store() -> CookSessionStore {
            CookSessionStore(defaults: defaults, now: { self.now }, syncAlerts: { self.alerts.append(($0, $1)) })
        }
    }

    private func session(_ title: String = "Pesto Pasta", id: UUID = UUID(), steps: Int = 5, meal: UUID? = nil, scale: Double = 1) -> CookSession {
        CookSession(recipeID: id, recipeTitle: title, stepCount: steps, mealID: meal, scale: scale, touchedAt: start)
    }

    private func timer(_ label: String, seconds: Int, startedSecondsAgo: Int = 0) -> CookTimer {
        CookTimer(label: label, seconds: seconds, started: start.addingTimeInterval(-TimeInterval(startedSecondsAgo)))
    }

    @Test func closingCookModeKeepsThePlaceAndTheTimers() throws {
        let bench = Bench(now: start)
        let store = bench.store()
        let pesto = session()
        store.start(pesto)
        #expect(store.showing == pesto.id)

        let rice = timer("Step 3", seconds: 600)
        store.update(CookProgress(page: 3, gathered: [UUID()], timers: [rice]), for: pesto.id)
        store.setAside()

        #expect(store.showing == nil)
        let aside = try #require(store.session)
        #expect(aside.progress.page == 3)
        #expect(aside.progress.timers == [rice])
        #expect(aside.place == "Step 3 of 5")
        // The timer's alerts were scheduled once and never cancelled.
        #expect(bench.alerts.last?.timers == [rice])
        #expect(bench.alerts.last?.title == "Pesto Pasta")

        // Starting the same recipe again resumes it instead of starting over.
        store.start(session(id: pesto.recipeID))
        #expect(store.showing == pesto.id)
        #expect(store.session?.progress.page == 3)
        #expect(store.waiting == nil)
    }

    @Test func aRecipeThatWasOnlyLookedAtIsntKept() {
        let bench = Bench(now: start)
        let store = bench.store()
        let pesto = session()
        store.start(pesto)
        // On a wide screen cook mode opens on the first step.
        store.update(CookProgress(page: 1), for: pesto.id)
        store.setAside()
        #expect(store.session == nil)
        #expect(bench.defaults.data(forKey: CookSessionStore.defaultsKey) == nil)
    }

    @Test func gatheringAnIngredientOrStartingATimerIsWorthKeeping() {
        #expect(!session().isWorthKeeping)
        var gathered = session()
        gathered.progress.gathered = [UUID()]
        #expect(gathered.isWorthKeeping)
        var timed = session()
        timed.progress.timers = [timer("Step 1", seconds: 60)]
        #expect(timed.isWorthKeeping)
        var onStepTwo = session()
        onStepTwo.progress.page = 2
        #expect(onStepTwo.isWorthKeeping)
        onStepTwo.isCooked = true
        #expect(!onStepTwo.isWorthKeeping)
    }

    @Test func finishingEndsTheSessionAndItsTimers() {
        let bench = Bench(now: start)
        let store = bench.store()
        let pesto = session()
        store.start(pesto)
        store.update(CookProgress(page: 4, timers: [timer("Step 4", seconds: 300)]), for: pesto.id)
        store.end()
        #expect(store.session == nil && store.showing == nil)
        #expect(bench.alerts.last?.timers.isEmpty == true)
        // Cook mode's last report as it closes doesn't bring the session back.
        store.update(CookProgress(page: 5), for: pesto.id)
        #expect(store.session == nil)
    }

    @Test func closingAfterThePantryUpdateEndsTheSession() {
        let bench = Bench(now: start)
        let store = bench.store()
        let pesto = session()
        store.start(pesto)
        store.update(CookProgress(page: 6, timers: [timer("Rest", seconds: 300)]), for: pesto.id)
        store.markCooked(pesto.id)
        // Its timers run until cook mode closes.
        #expect(store.session?.progress.timers.count == 1)
        store.setAside()
        #expect(store.session == nil)
        #expect(bench.alerts.last?.timers.isEmpty == true)
    }

    @Test func anotherRecipeWaitsForTheCookToChoose() throws {
        let bench = Bench(now: start)
        let store = bench.store()
        let pesto = session()
        store.start(pesto)
        store.update(CookProgress(page: 2, timers: [timer("Step 2", seconds: 600)]), for: pesto.id)
        store.setAside()

        let tacos = session("Tacos")
        store.start(tacos)
        #expect(store.waiting?.id == tacos.id)
        #expect(store.showing == nil)
        #expect(store.session?.id == pesto.id)

        // Keeping the first recipe leaves it as it was.
        store.dropWaiting()
        #expect(store.waiting == nil && store.session?.progress.page == 2)

        // Switching ends it, timers included.
        store.start(tacos)
        store.startOver(with: try #require(store.waiting))
        #expect(store.session?.id == tacos.id && store.showing == tacos.id)
        #expect(store.waiting == nil)
        #expect(bench.alerts.last?.timers.isEmpty == true)
        #expect(bench.alerts.last?.title == "Tacos")
    }

    @Test func cookingTheSameRecipeFromThePlanAdoptsTheMeal() {
        let bench = Bench(now: start)
        let store = bench.store()
        let pesto = session()
        store.start(pesto)
        store.update(CookProgress(page: 3), for: pesto.id)
        store.setAside()

        let meal = UUID()
        store.start(session(id: pesto.recipeID, meal: meal, scale: 2))
        #expect(store.session?.id == pesto.id)
        #expect(store.session?.mealID == meal && store.session?.scale == 2)
        #expect(store.session?.progress.page == 3)

        // A second planned meal of the same recipe doesn't take it over.
        store.setAside()
        store.start(session(id: pesto.recipeID, meal: UUID(), scale: 4))
        #expect(store.session?.mealID == meal && store.session?.scale == 2)
    }

    @Test func theSessionSurvivesARelaunch() throws {
        let bench = Bench(now: start)
        let first = bench.store()
        let pesto = session()
        let rice = timer("Step 3", seconds: 1200)
        let gathered: Set<UUID> = [UUID(), UUID()]
        first.start(pesto)
        first.update(CookProgress(page: 3, gathered: gathered, timers: [rice], addMissing: false), for: pesto.id)
        first.setAside()

        bench.now = start.addingTimeInterval(600)
        let second = bench.store()
        second.restore { $0 == pesto.recipeID }
        let restored = try #require(second.session)
        #expect(restored.id == pesto.id)
        #expect(restored.progress == CookProgress(page: 3, gathered: gathered, timers: [rice], addMissing: false))
        // Still counting from when it was started, not from the relaunch.
        #expect(restored.progress.timers[0].remaining(at: bench.now) == 600)
        // Set aside before the app quit, so it waits behind the resume bar.
        #expect(second.showing == nil)
        #expect(second.resume())
        #expect(second.showing == pesto.id)
    }

    @Test func quittingInCookModeComesBackToCookMode() {
        let bench = Bench(now: start)
        let first = bench.store()
        let pesto = session()
        first.start(pesto)
        first.update(CookProgress(page: 4), for: pesto.id)

        let second = bench.store()
        second.restore { _ in true }
        #expect(second.showing == pesto.id)
        #expect(second.session?.progress.page == 4)
    }

    @Test func aRelaunchForgetsWhatCantBeResumed() {
        // The recipe was deleted.
        var bench = Bench(now: start)
        var store = bench.store()
        var pesto = session()
        store.start(pesto)
        store.update(CookProgress(page: 3), for: pesto.id)
        store.setAside()
        var relaunched = bench.store()
        relaunched.restore { _ in false }
        #expect(relaunched.session == nil)
        #expect(bench.defaults.data(forKey: CookSessionStore.defaultsKey) == nil)

        // Set aside yesterday.
        bench = Bench(now: start)
        store = bench.store()
        pesto = session()
        store.start(pesto)
        store.update(CookProgress(page: 3), for: pesto.id)
        store.setAside()
        bench.now = start.addingTimeInterval(CookSession.shelfLife + 60)
        relaunched = bench.store()
        relaunched.restore { _ in true }
        #expect(relaunched.session == nil)

        // Cook mode was open when the app quit, but nothing had been done.
        bench = Bench(now: start)
        store = bench.store()
        store.start(session())
        relaunched = bench.store()
        relaunched.restore { _ in true }
        #expect(relaunched.session == nil && relaunched.showing == nil)
    }

    @Test func aRunningTimerKeepsARecipeFromGoingStale() {
        var slow = session()
        slow.progress.timers = [timer("Braise", seconds: 8 * 3600)]
        let afterShelfLife = start.addingTimeInterval(CookSession.shelfLife + 60)
        #expect(!slow.isAbandoned(at: afterShelfLife))
        #expect(slow.isAbandoned(at: start.addingTimeInterval(8 * 3600 + CookSession.shelfLife + 60)))
        #expect(session().isAbandoned(at: afterShelfLife))
        #expect(!session().isAbandoned(at: start.addingTimeInterval(3600)))
    }

    @Test func comingBackToTheAppDropsAStaleRecipeAndRefreshesTimers() {
        let bench = Bench(now: start)
        let store = bench.store()
        let pesto = session()
        store.start(pesto)
        store.update(CookProgress(page: 2, timers: [timer("Step 2", seconds: 60)]), for: pesto.id)
        store.setAside()

        let before = bench.alerts.count
        bench.now = start.addingTimeInterval(120)
        store.refresh()
        // The finished timer is reported again so it moves behind running ones.
        #expect(bench.alerts.count == before + 1)
        #expect(store.session != nil)

        bench.now = start.addingTimeInterval(CookSession.shelfLife + 3600)
        store.refresh()
        #expect(store.session == nil)
        #expect(bench.alerts.last?.timers.isEmpty == true)
    }

    @Test func describesWhereTheCookIs() {
        var pesto = session(steps: 4)
        #expect(pesto.place == "Ingredients")
        pesto.progress.page = 4
        #expect(pesto.place == "Step 4 of 4")
        pesto.progress.page = 5
        #expect(pesto.place == "Finishing up")
    }
}
