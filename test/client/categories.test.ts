import { describe, it, expect } from "vitest";
import {
  categoryOf,
  resolveItemColor,
  isCategoryKey,
  CATEGORIES,
} from "../../src/lib/categories";

describe("categories", () => {
  it("categoryOf falls back to the default for unknown / null", () => {
    expect(categoryOf("kasvi").key).toBe("kasvi");
    expect(categoryOf("linnunpontto").label).toBe("Linnunpönttö");
    expect(categoryOf(undefined).key).toBe("kasvi");
    expect(categoryOf(null).key).toBe("kasvi");
    expect(categoryOf("nope").key).toBe("kasvi");
  });

  it("resolveItemColor prefers a valid override, else the category colour", () => {
    expect(resolveItemColor("kasvi", "#123abc")).toBe("#123abc");
    expect(resolveItemColor("kasvi", null)).toBe(categoryOf("kasvi").color);
    // An invalid colour string is ignored in favour of the category colour.
    expect(resolveItemColor("riistakamera", "red")).toBe(
      categoryOf("riistakamera").color,
    );
  });

  it("isCategoryKey validates built-in keys only", () => {
    expect(isCategoryKey("kasvi")).toBe(true);
    expect(CATEGORIES.every((c) => isCategoryKey(c.key))).toBe(true);
    expect(isCategoryKey("nope")).toBe(false);
    expect(isCategoryKey(5)).toBe(false);
  });
});
