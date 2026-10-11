import CoreGraphics
import Foundation

/// A paragraph read from a photographed page. `box` uses Vision's normalized
/// coordinates, with the origin at the bottom left.
nonisolated struct ScannedBlock: Equatable {
    var text: String
    var box: CGRect
    /// Height of the paragraph's first line; the largest type is the title.
    var lineHeight: Double
}

/// Arranges the paragraphs of a cookbook page into recipe text with clear
/// sections. Pages lay recipes out in columns and rarely print "Ingredients"
/// or "Method", so reading top to bottom splits wrapped ingredient lines
/// and reads a headnote beside the ingredient column as the first step.
/// This sorts paragraphs by what they look like and where they sit, then
/// writes the sections `RecipeTextReader` and Apple Intelligence expect.
enum ScannedRecipeLayout {
    private enum Kind: Equatable {
        case unknown, skip, title, tags, meta, summary, ingredient, step, nutrition, note
        case heading(Section)
    }

    private enum Section { case ingredients, steps, notes }

    static func text(from input: [ScannedBlock]) -> String {
        let blocks = repairMarkers(joinOrphanMarkers(input.map(normalized).filter { !$0.text.isEmpty }))
        guard !blocks.isEmpty else { return "" }
        var kinds = blocks.map(kind)

        if let title = titleIndex(blocks, kinds) { kinds[title] = .title }

        // Short lines in the same column as ingredients are ingredients too
        // ("Grated zest of 1 orange" or "Fresh basil" don't start with an amount).
        var changed = true
        while changed {
            changed = false
            for index in blocks.indices where kinds[index] == .unknown && words(blocks[index].text) <= 14 {
                let neighbours = [neighbour(of: index, in: blocks, above: true), neighbour(of: index, in: blocks, above: false)]
                if neighbours.contains(where: { $0.map { kinds[$0] == .ingredient } ?? false })
                    || neighbour(of: index, in: blocks, above: true).map({ kinds[$0] == .heading(.ingredients) }) == true {
                    kinds[index] = .ingredient
                    changed = true
                }
            }
        }

        // Prose under a method heading or the first numbered step is method;
        // prose above it is the headnote.
        let methodStarts = blocks.indices.filter { kinds[$0] == .step || kinds[$0] == .heading(.steps) }
        let unknown = blocks.indices.filter { kinds[$0] == .unknown }
        if !methodStarts.isEmpty {
            for index in unknown {
                let below = methodStarts.contains { blocks[index].box.midY < blocks[$0].box.maxY && overlaps(blocks[index].box, blocks[$0].box) }
                if below { kinds[index] = .step }
                else if methodStarts.allSatisfy({ blocks[index].box.midY > blocks[$0].box.maxY }) { kinds[index] = .summary }
                else { kinds[index] = .note }
            }
        } else if !unknown.isEmpty {
            // Unnumbered method: prose above the ingredients is the headnote,
            // the rest is method. With no clue, the first paragraph is the headnote.
            let ingredients = blocks.indices.filter { kinds[$0] == .ingredient }
            for index in unknown {
                let aboveIngredients = ingredients.contains { overlaps(blocks[index].box, blocks[$0].box) }
                    && ingredients.allSatisfy { !overlaps(blocks[index].box, blocks[$0].box) || blocks[index].box.minY > blocks[$0].box.midY }
                kinds[index] = aboveIngredients ? .summary : .step
            }
            if unknown.count > 1, !unknown.contains(where: { kinds[$0] == .summary }) { kinds[unknown[0]] = .summary }
        }

        func lines(_ wanted: Kind) -> [String] { blocks.indices.filter { kinds[$0] == wanted }.map { blocks[$0].text } }
        var out: [String] = []
        out += lines(.title)
        out += lines(.tags)
        out += lines(.meta)
        out += lines(.summary)
        for (heading, kind) in [("Ingredients", Kind.ingredient), ("Instructions", .step), ("Nutrition per serving", .nutrition), ("Notes", .note)] {
            let section = lines(kind)
            if !section.isEmpty { out += ["", heading] + section }
        }
        return out.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - Reading blocks

    private static func normalized(_ block: ScannedBlock) -> ScannedBlock {
        var block = block
        block.text = block.text
            .replacingOccurrences(of: #"-\s*\n\s*"#, with: "-", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        return block
    }

    /// Vision sometimes reads a step's number ("2." or just "4") as its own
    /// paragraph, and not always just before the step in reading order.
    /// Attach it to the paragraph that starts beside it on the same line.
    private static func joinOrphanMarkers(_ blocks: [ScannedBlock]) -> [ScannedBlock] {
        var blocks = blocks
        var orphans: [Int] = []
        for index in blocks.indices {
            guard let number = blocks[index].text.firstMatch(of: /^(\d{1,2})[.)]?$/)?.1 else { continue }
            let marker = blocks[index].box
            let step = blocks.indices
                .filter { other in
                    let box = blocks[other].box
                    return other != index && !orphans.contains(other)
                        && box.minX >= marker.midX && box.minX - marker.maxX < 0.1
                        && marker.midY >= box.minY && marker.midY <= box.maxY + marker.height / 2
                }
                .min { blocks[$0].box.minX < blocks[$1].box.minX }
            guard let step else { continue }
            blocks[step].text = "\(number). \(blocks[step].text)"
            blocks[step].box = blocks[step].box.union(marker)
            orphans.append(index)
        }
        return blocks.indices.filter { !orphans.contains($0) }.map { blocks[$0] }
    }

    /// A step number misread as a letter ("s." for "5.") follows the step before it.
    private static func repairMarkers(_ blocks: [ScannedBlock]) -> [ScannedBlock] {
        var last: Int?
        return blocks.map { block in
            var block = block
            if let number = block.text.firstMatch(of: /^(\d{1,2})[.)]\s/) {
                last = Int(number.1)
            } else if let previous = last, let misread = block.text.firstMatch(of: /^[sSlIOoZzBg][.)]\s+(?=[A-Z])/) {
                block.text = "\(previous + 1). " + block.text[misread.range.upperBound...]
                last = previous + 1
            }
            return block
        }
    }

    private static func kind(_ block: ScannedBlock) -> Kind {
        let text = block.text
        func matches(_ pattern: String) -> Bool {
            text.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
        }
        if matches(#"^\d{1,4}$"#) { return .skip }
        if matches(#"^(?:the\s+)?ingredients?\s*:?$"#) { return .heading(.ingredients) }
        if matches(#"^(?:the\s+)?(?:instructions?|directions?|method|steps?|preparation)\s*:?$"#) { return .heading(.steps) }
        if matches(#"^(?:recipe\s+)?(?:notes?|tips|cook'?s notes?)\s*:?$"#) { return .heading(.notes) }
        if matches(#"^(?:nutrition(?:al)?(?:\s+(?:facts|information|info))?|per serving)(?:\s*\(?per serving\)?)?\s*:?$"#) { return .skip }
        // Running headers and footers ("30-MINUTE MAINS") sit in the margins.
        if (block.box.midY < 0.06 || block.box.midY > 0.94) && (text == text.uppercased() || words(text) <= 4) { return .skip }
        if RecipeTextReader.isDietaryLabels(text) { return .tags }
        if RecipeTextReader.nutritionValue(text) != nil { return .nutrition }
        if RecipeTextReader.isMetaLine(text) { return .meta }
        if matches(#"^(?:step\s*)?\d{1,2}[.)]\s+\S"#) && words(text) >= 3 { return .step }
        if matches(#"^(?:notes?|tips?|cook'?s notes?|variations?|make ahead|storage|to store)\b\s*:"#) { return .note }
        if IngredientParser.looksLikeIngredient(text) { return .ingredient }
        return .unknown
    }

    /// The paragraph set in clearly larger type than the body.
    private static func titleIndex(_ blocks: [ScannedBlock], _ kinds: [Kind]) -> Int? {
        let heights = blocks.map(\.lineHeight).filter { $0 > 0 }.sorted()
        guard !heights.isEmpty else { return nil }
        let median = heights[heights.count / 2]
        let candidates = blocks.indices.filter { index in
            [.unknown, .ingredient].contains(kinds[index]) && words(blocks[index].text) <= 15
                && blocks[index].text.contains(where: \.isLetter) && blocks[index].lineHeight >= median * 1.4
        }
        return candidates.max { blocks[$0].lineHeight < blocks[$1].lineHeight }
    }

    // MARK: - Geometry

    private static func words(_ text: String) -> Int { text.split(separator: " ").count }

    /// Two boxes share a column when they overlap across half the narrower one.
    private static func overlaps(_ a: CGRect, _ b: CGRect) -> Bool {
        let shared = min(a.maxX, b.maxX) - max(a.minX, b.minX)
        return shared > 0.5 * min(a.width, b.width)
    }

    /// The closest paragraph directly above or below in the same column.
    private static func neighbour(of index: Int, in blocks: [ScannedBlock], above: Bool) -> Int? {
        let box = blocks[index].box
        return blocks.indices
            .filter { $0 != index && overlaps(box, blocks[$0].box) && (above ? blocks[$0].box.midY > box.midY : blocks[$0].box.midY < box.midY) }
            .min { abs(blocks[$0].box.midY - box.midY) < abs(blocks[$1].box.midY - box.midY) }
    }
}
