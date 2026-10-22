import CoreMotion
import Foundation

/// Tells a deliberate shake from a bump. UIKit's shake event also fires when
/// the phone lands on a couch, so this counts swings instead: a shake is
/// several strong movements, each the opposite way to the one before, within
/// a second. A drop is one jolt and maybe a weaker bounce.
nonisolated struct ShakeRecognizer {
    /// Movement beyond gravity, in g, that counts as a swing.
    var threshold = 1.3
    /// Swings needed, alternating direction: back, forth, back, forth.
    var swingsNeeded = 4
    /// How long the swings may take altogether.
    var window: TimeInterval = 1.0
    /// Swings closer together than this are an impact ringing, not a hand.
    var minimumGap: TimeInterval = 0.06

    private var gravity: SIMD3<Double>?
    private var swings: [(time: TimeInterval, direction: SIMD3<Double>)] = []

    /// Adds an accelerometer reading (in g); true when it completes a shake.
    mutating func add(_ acceleration: SIMD3<Double>, at time: TimeInterval) -> Bool {
        guard let previous = gravity else { gravity = acceleration; return false }
        // A slow average of the readings is gravity; what's left is movement.
        let gravity = previous * 0.9 + acceleration * 0.1
        self.gravity = gravity
        let movement = acceleration - gravity
        let strength = (movement * movement).sum().squareRoot()
        guard strength >= threshold else { return false }

        swings.removeAll { time - $0.time > window }
        if let last = swings.last {
            // Still the same swing, or too soon after it.
            guard (movement * last.direction).sum() < 0, time - last.time >= minimumGap else { return false }
        }
        swings.append((time, movement))
        guard swings.count >= swingsNeeded else { return false }
        swings.removeAll()
        return true
    }
}

enum ShakeDetector {
    /// Shakes while the stream is being read; the accelerometer runs only
    /// until the reading task ends.
    static func shakes() -> AsyncStream<Void> {
        AsyncStream { continuation in
            let motion = Motion()
            guard motion.manager.isAccelerometerAvailable else { continuation.finish(); return }
            motion.manager.accelerometerUpdateInterval = 1.0 / 60
            // Updates arrive one at a time on the main queue.
            motion.manager.startAccelerometerUpdates(to: .main) { data, _ in
                guard let data else { return }
                let reading = SIMD3(data.acceleration.x, data.acceleration.y, data.acceleration.z)
                if motion.recognizer.add(reading, at: data.timestamp) { continuation.yield() }
            }
            continuation.onTermination = { _ in motion.manager.stopAccelerometerUpdates() }
        }
    }

    private nonisolated final class Motion: @unchecked Sendable {
        let manager = CMMotionManager()
        var recognizer = ShakeRecognizer()
    }
}
