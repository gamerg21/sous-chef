import { describe, expect, test } from "vitest";
import { unitLabel } from "../src/lib/units";

describe("unitLabel", () => {
  test("pluralizes spelled-out units above one", () => {
    expect(unitLabel("cup", 2)).toBe("cups");
    expect(unitLabel("cup", "1 1/2")).toBe("cups");
    expect(unitLabel("bunch", 3)).toBe("bunches");
    expect(unitLabel("box", 2)).toBe("boxes");
    expect(unitLabel("leaf", 4)).toBe("leaves");
    expect(unitLabel("cup", 0)).toBe("cups");
  });

  test("keeps singular for one or less, and when the amount is unknown", () => {
    expect(unitLabel("cup", 1)).toBe("cup");
    expect(unitLabel("cup", "1/2")).toBe("cup");
    expect(unitLabel("cup", undefined)).toBe("cup");
    expect(unitLabel("cup", "")).toBe("cup");
  });

  test("leaves abbreviations, phrases, and plurals alone", () => {
    for (const unit of ["tbsp", "g", "oz", "fl oz", "each", "to taste", "°C", "cloves"]) {
      expect(unitLabel(unit, 3)).toBe(unit);
    }
    expect(unitLabel(undefined, 3)).toBe("");
  });
});
