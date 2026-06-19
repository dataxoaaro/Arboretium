import { describe, it, expect, beforeEach } from "vitest";
import {
  readHexMode,
  writeHexMode,
  HEX_MODES,
} from "../../src/components/map/visibility-mode";

beforeEach(() => {
  localStorage.clear();
});

describe("hex visibility mode", () => {
  it("defaults to 'on' when nothing is stored", () => {
    expect(readHexMode()).toBe("on");
  });

  it("round-trips off and on", () => {
    writeHexMode("off");
    expect(readHexMode()).toBe("off");
    writeHexMode("on");
    expect(readHexMode()).toBe("on");
  });

  it("migrates legacy values to 'on'", () => {
    localStorage.setItem("arb.hexVisibilityMode", "occupied");
    expect(readHexMode()).toBe("on");
    localStorage.setItem("arb.hexVisibilityMode", "full");
    expect(readHexMode()).toBe("on");
  });

  it("exposes the two valid modes", () => {
    expect(HEX_MODES).toEqual(["off", "on"]);
  });
});
