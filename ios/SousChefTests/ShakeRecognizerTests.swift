import Foundation
import Testing
@testable import SousChef

struct ShakeRecognizerTests {
    private let rate = 60.0
    private let resting = SIMD3<Double>(0, 0, -1)

    /// Feeds readings at 60 Hz, starting after a second at rest; true if
    /// any of them completed a shake.
    private func recognizes(_ readings: [SIMD3<Double>]) -> Bool {
        var recognizer = ShakeRecognizer()
        let all = Array(repeating: resting, count: Int(rate)) + readings
        return all.enumerated().contains { index, reading in recognizer.add(reading, at: Double(index) / rate) }
    }

    @Test func recognizesAShake() {
        // A second of shaking side to side, about four times a second.
        let shake = (0..<60).map { i in resting + SIMD3(2.5 * sin(2 * .pi * 4 * Double(i) / rate), 0, 0) }
        #expect(recognizes(shake))
    }

    @Test func ignoresADropOntoACouch() {
        let fall = Array(repeating: SIMD3<Double>(0, 0, 0), count: 18)
        let landing: [SIMD3<Double>] = [SIMD3(0.3, 0.2, -4), SIMD3(-0.2, 0, -3), SIMD3(0, 0, -1.6), SIMD3(0, 0, 0.2), SIMD3(0, 0, -0.4)]
        let rest = Array(repeating: resting, count: 120)
        #expect(!recognizes(fall + landing + rest))
    }

    @Test func ignoresLandingOnItsFace() {
        // Falls, lands and ends up face down: gravity flips.
        let fall = Array(repeating: SIMD3<Double>(0, 0, 0), count: 18)
        let landing: [SIMD3<Double>] = [SIMD3(0, 0, 3.5), SIMD3(0, 0, 2.2), SIMD3(0, 0, 0.6)]
        let rest = Array(repeating: SIMD3<Double>(0, 0, 1), count: 120)
        #expect(!recognizes(fall + landing + rest))
    }

    @Test func ignoresPickingThePhoneUp() {
        let tilt = (0..<90).map { i -> SIMD3<Double> in
            let angle = Double(i) / 90 * .pi / 2
            return SIMD3(0, -sin(angle), -cos(angle)) + SIMD3(0, 0, 0.4 * sin(Double(i) / 90 * .pi))
        }
        #expect(!recognizes(tilt))
    }
}
