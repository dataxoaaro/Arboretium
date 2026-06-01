// Hex visibility for the property MapView. The "full" mode (render every hex
// in the viewport regardless of property) was removed — we now only ever
// draw the cells inside the current property's `included_hexes`. Old
// localStorage values are migrated transparently on read.

export type HexVisibilityMode = "off" | "on";

export const HEX_MODES: ReadonlyArray<HexVisibilityMode> = ["off", "on"];

const STORAGE_KEY = "arb.hexVisibilityMode";

export function readHexMode(): HexVisibilityMode {
  if (typeof localStorage === "undefined") return "on";
  const stored = localStorage.getItem(STORAGE_KEY);
  // Legacy values: "occupied" → "on", "full" → "on".
  if (stored === "off") return "off";
  return "on";
}

export function writeHexMode(mode: HexVisibilityMode): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, mode);
}
