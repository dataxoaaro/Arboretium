import { describe, it, expect } from "vitest";
import { parseHexes, encodeHexes, now } from "../../worker/lib/db";

describe("parseHexes", () => {
  it("parses a JSON array of strings", () => {
    expect(parseHexes('["a","b","c"]')).toEqual(["a", "b", "c"]);
  });

  it("parses an empty array", () => {
    expect(parseHexes("[]")).toEqual([]);
  });

  it("throws on non-array JSON", () => {
    expect(() => parseHexes('{"a":1}')).toThrow();
  });

  it("throws on an array containing non-strings", () => {
    expect(() => parseHexes('["a",1]')).toThrow();
  });

  it("throws on invalid JSON", () => {
    expect(() => parseHexes("not json")).toThrow();
  });
});

describe("encodeHexes", () => {
  it("round-trips with parseHexes", () => {
    const hexes = ["cell-1", "cell-2"];
    expect(parseHexes(encodeHexes(hexes))).toEqual(hexes);
  });
});

describe("now", () => {
  it("returns a millisecond unix timestamp", () => {
    const t = now();
    expect(typeof t).toBe("number");
    expect(t).toBeGreaterThan(1_600_000_000_000);
  });
});
