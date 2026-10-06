import SwiftUI

/// Sets a timer the recipe didn't mention. A kitchen-timer dial: drag the
/// knob around the ring (one turn is an hour, past an hour keeps winding),
/// or nudge it with the quick-add chips, then give it an optional name.
struct CustomTimerSheet: View {
    /// What the timer is called when no name is typed, such as "Step 3".
    let defaultLabel: String
    var start: (_ label: String, _ seconds: Int) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var seconds = 5 * 60
    @State private var name = ""
    @FocusState private var naming: Bool

    static let maxSeconds = 12 * 3600

    var body: some View {
        VStack(spacing: 22) {
            HStack {
                Eyebrow("Custom timer", systemImage: "timer")
                Spacer()
                Button("Cancel", systemImage: "xmark", role: .close) { dismiss() }
                    .labelStyle(.iconOnly)
                    .buttonStyle(.glass)
                    .buttonBorderShape(.circle)
            }

            TimerDial(seconds: $seconds, maxSeconds: Self.maxSeconds)
                .frame(maxWidth: 280)

            HStack(spacing: 8) {
                ForEach([30, 60, 5 * 60, 15 * 60], id: \.self) { step in
                    Button {
                        seconds = min(Self.maxSeconds, seconds + step)
                    } label: {
                        Text("+" + (step < 60 ? "\(step)s" : "\(step / 60)m"))
                            .font(.subheadline.weight(.semibold).monospacedDigit())
                            .frame(maxWidth: .infinity, minHeight: 36)
                    }
                    .buttonStyle(.glass)
                    .tint(Color.brand)
                }
                Button("Clear", systemImage: "arrow.counterclockwise") { seconds = 0 }
                    .labelStyle(.iconOnly)
                    .font(.subheadline.weight(.semibold))
                    .frame(minHeight: 36)
                    .buttonStyle(.glass)
                    .disabled(seconds == 0)
            }
            .sensoryFeedback(.increase, trigger: seconds) { old, new in new > old + 1 }

            HStack(spacing: 10) {
                Image(systemName: "tag").foregroundStyle(.secondary)
                TextField(defaultLabel, text: $name, prompt: Text("Name it, like “Rice” (optional)"))
                    .focused($naming)
                    .submitLabel(.done)
                    .textInputAutocapitalization(.sentences)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(.background.secondary, in: .capsule)

            Button {
                let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
                start(trimmed.isEmpty ? defaultLabel : String(trimmed.prefix(40)), seconds)
                dismiss()
            } label: {
                Label(seconds == 0 ? "Set a time" : "Start \(CookTimer.describe(seconds)) timer", systemImage: "play.fill")
                    .font(.headline)
                    .contentTransition(.numericText())
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.glassProminent)
            .tint(Color.brand)
            .disabled(seconds == 0)
            .accessibilityIdentifier("startCustomTimer")
        }
        .padding(20)
        .animation(.snappy, value: seconds)
        .presentationDetents([.height(640), .large])
        .presentationDragIndicator(.visible)
    }
}

/// A round dial with minute ticks, a filled arc for the time within the
/// current hour, and a knob to drag. Each finished hour adds a ring of
/// "laps" so long times still read at a glance.
struct TimerDial: View {
    @Binding var seconds: Int
    let maxSeconds: Int

    /// Where the drag was last, in turns (0 at the top, clockwise), and the
    /// unrounded time it has wound to, so slow drags still add up.
    @State private var lastTurn: Double?
    @State private var dragSeconds: Double = 0

    private let lineWidth: CGFloat = 22

    private var hours: Int { seconds / 3600 }
    /// How far around the current hour the knob sits, 0–1.
    private var fraction: Double {
        let within = seconds % 3600
        return seconds > 0 && within == 0 ? 1 : Double(within) / 3600
    }

    var body: some View {
        GeometryReader { proxy in
            let size = min(proxy.size.width, proxy.size.height)
            let radius = (size - lineWidth) / 2
            ZStack {
                ticks(radius: radius - lineWidth / 2 - 10)

                Circle()
                    .stroke(Color.brandSoft, lineWidth: lineWidth)
                    .padding(lineWidth / 2)

                // Finished hours: a full ring under the current lap.
                if hours > 0 && fraction < 1 {
                    Circle()
                        .stroke(Color.brand.opacity(0.35), lineWidth: lineWidth)
                        .padding(lineWidth / 2)
                }

                Circle()
                    .trim(from: 0, to: fraction)
                    .stroke(
                        AngularGradient(colors: [Color.brand.opacity(0.55), Color.brand], center: .center,
                                        startAngle: .degrees(0), endAngle: .degrees(360 * max(fraction, 0.01))),
                        style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                    .padding(lineWidth / 2)

                knob
                    .offset(knobOffset(radius: radius))

                VStack(spacing: 2) {
                    Text(CookTimer.clock(seconds))
                        .font(.system(size: size * 0.2, weight: .bold, design: .rounded).monospacedDigit())
                        .contentTransition(.numericText(value: Double(seconds)))
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                    Text(subtitle)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.secondary)
                        .contentTransition(.opacity)
                }
                .padding(.horizontal, lineWidth * 2)
            }
            .frame(width: size, height: size)
            .contentShape(.circle)
            .gesture(drag(center: CGPoint(x: size / 2, y: size / 2)))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .aspectRatio(1, contentMode: .fit)
        .sensoryFeedback(.selection, trigger: seconds / 60)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Timer length")
        .accessibilityValue(seconds == 0 ? "Not set" : CookTimer.describe(seconds).replacingOccurrences(of: "-", with: " "))
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: seconds = min(maxSeconds, seconds + 60)
            case .decrement: seconds = max(0, seconds - 60)
            @unknown default: break
            }
        }
    }

    private var subtitle: String {
        if seconds == 0 { return "Turn the dial" }
        let duration = Duration.seconds(seconds)
        return duration.formatted(.units(allowed: [.hours, .minutes, .seconds], width: .wide, maximumUnitCount: 2))
    }

    private var knob: some View {
        Circle()
            .fill(.white)
            .frame(width: lineWidth + 14, height: lineWidth + 14)
            .overlay(Circle().strokeBorder(Color.brand, lineWidth: 3))
            .overlay(Circle().fill(Color.brand).frame(width: 10, height: 10))
            .shadow(color: .black.opacity(0.18), radius: 6, y: 3)
            .scaleEffect(lastTurn == nil ? 1 : 1.15)
            .animation(.bouncy, value: lastTurn == nil)
    }

    private func knobOffset(radius: CGFloat) -> CGSize {
        let angle = fraction * 2 * .pi
        return CGSize(width: sin(angle) * radius, height: -cos(angle) * radius)
    }

    /// Sixty minute ticks with longer ones every five minutes.
    private func ticks(radius: CGFloat) -> some View {
        ZStack {
            ForEach(0..<60, id: \.self) { minute in
                let major = minute % 5 == 0
                Capsule()
                    .fill(Double(minute) / 60 < fraction || hours > 0 ? Color.brand.opacity(major ? 0.7 : 0.35) : Color.secondary.opacity(major ? 0.5 : 0.2))
                    .frame(width: major ? 3 : 1.5, height: major ? 10 : 5)
                    .offset(y: -radius)
                    .rotationEffect(.degrees(Double(minute) * 6))
            }
        }
    }

    private func drag(center: CGPoint) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                let dx = value.location.x - center.x
                let dy = value.location.y - center.y
                // Turns clockwise from the top, 0..<1.
                var turn = atan2(dx, -dy) / (2 * .pi)
                if turn < 0 { turn += 1 }
                guard let last = lastTurn else {
                    lastTurn = turn
                    dragSeconds = Double(seconds)
                    return
                }
                var delta = turn - last
                if delta > 0.5 { delta -= 1 } else if delta < -0.5 { delta += 1 }
                dragSeconds = min(Double(maxSeconds), max(0, dragSeconds + delta * 3600))
                lastTurn = turn
                // Whole minutes while dragging; the chips add finer steps.
                let snapped = Int((dragSeconds / 60).rounded()) * 60
                if snapped != seconds { seconds = snapped }
            }
            .onEnded { _ in lastTurn = nil }
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        CustomTimerSheet(defaultLabel: "Step 2") { _, _ in }
    }
}
