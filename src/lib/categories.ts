// Built-in item categories. Each map item (stored in the `plants` table) has a
// category that sets its default colour; an item may override the colour with a
// swatch from PALETTE. Categories are a fixed set — no custom categories.
//
// This is the single source of truth shared by the form (chips), the map (hex
// colours) and the worker (validation mirrors CATEGORY_KEYS).

export type CategoryKey = "kasvi" | "linnunpontto" | "riistakamera";

export interface Category {
  key: CategoryKey;
  /** Finnish label shown on the picker chip. */
  label: string;
  /** Default colour (hex) when the item has no explicit override. */
  color: string;
  /** Emoji icon shown on the chip. */
  icon: string;
}

export const CATEGORIES: ReadonlyArray<Category> = [
  { key: "kasvi", label: "Kasvi", color: "#3f7d44", icon: "🌱" },
  { key: "linnunpontto", label: "Linnunpönttö", color: "#2f6f9f", icon: "🪺" },
  { key: "riistakamera", label: "Riistakamera", color: "#c0612f", icon: "📷" },
];

export const CATEGORY_KEYS: ReadonlyArray<CategoryKey> = CATEGORIES.map(
  (c) => c.key,
);

export const DEFAULT_CATEGORY: CategoryKey = "kasvi";

/** Premade colour swatches for the per-item override. */
export const PALETTE: ReadonlyArray<string> = [
  "#3f7d44", // green
  "#2f6f9f", // blue
  "#c0612f", // orange
  "#8a5fb0", // purple
  "#b03f6a", // pink
  "#caa23a", // yellow
  "#3aa3a0", // teal
  "#5a5f6a", // slate
];

export function isCategoryKey(value: unknown): value is CategoryKey {
  return (
    typeof value === "string" && CATEGORY_KEYS.includes(value as CategoryKey)
  );
}

/** The category record for a key, falling back to the default category. */
export function categoryOf(key: string | null | undefined): Category {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[0];
}

/**
 * The display colour for an item: its explicit override if set, otherwise the
 * colour of its category.
 */
export function resolveItemColor(
  category: string | null | undefined,
  color: string | null | undefined,
): string {
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return categoryOf(category).color;
}
