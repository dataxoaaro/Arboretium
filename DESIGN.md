# Arboretum Mapper — Design System

A calm, minimal, **nature** aesthetic for a plant-mapping app used outdoors, on
a phone, by a small family that includes older users. The design optimizes for
**legibility, large touch targets, and obvious primary actions** over density or
decoration.

> Implemented in `src/index.css` (`@theme` tokens) and `src/components/ui/`.
> The map/WebGL layer (`MapView`, `AdminMap`) styles its own overlays inline.

## 1. Principles

1. **One obvious action per screen.** Primary buttons are big, green, and
   unambiguous. Secondary/destructive actions recede.
2. **Big enough to tap with a thumb in gloves.** Interactive targets are ≥48px
   tall (`Button` default `min-h-12`); primary screen actions use `lg`
   (`min-h-14`). Inputs never render below 16px (no iOS zoom-on-focus).
3. **Readable in sunlight.** High contrast: dark forest text on warm paper,
   solid (not translucent) text. Avoid thin weights and tiny captions for
   primary content.
4. **Calm, not clinical.** Warm paper background, soft hairline borders,
   generously rounded corners (`rounded-2xl`), restrained shadows. The
   satellite imagery and plant photos are the color; the chrome stays quiet.
5. **Mobile-first.** Layouts are single-column and reachable; bottom sheets for
   detail; `100dvh` and safe-area padding so nothing hides behind browser
   chrome or the home indicator.

## 2. Color (oklch tokens)

| Token                   | Role                                  | Value                   |
| ----------------------- | ------------------------------------- | ----------------------- |
| `--color-bg`            | App background — warm paper           | `oklch(97.8% .012 110)` |
| `--color-surface`       | Cards, sheets                         | `oklch(100% 0 0)`       |
| `--color-fg`            | Primary text — bark/forest near-black | `oklch(27% .03 150)`    |
| `--color-muted`         | Secondary text                        | `oklch(48% .02 150)`    |
| `--color-border`        | Hairline borders                      | `oklch(89% .012 130)`   |
| `--color-accent`        | **Primary** — leaf green              | `oklch(52% .11 150)`    |
| `--color-accent-strong` | Hover / pressed green                 | `oklch(45% .11 150)`    |
| `--color-amber`         | **Annotated** cells (notes/photos)    | `oklch(72% .12 75)`     |
| `--color-amber-strong`  | Annotated stroke / hover              | `oklch(58% .11 70)`     |
| `--color-danger`        | Destructive (delete)                  | `oklch(52% .17 25)`     |

**Map semantics** (the heart of the spatial UI — see CONTEXT.md):

- **Planted cell** (has plants) → **green** fill + green plant markers.
- **Annotated cell** (notes/photos, no plants) → **amber/honey** fill + a
  distinct amber marker. This is the ARB-146 distinction.
- **Empty cell** → barely-there neutral outline.

## 3. Typography

- **Body**: system humanist sans (`system-ui` stack). Base 16px; primary content
  `text-base`, never below `text-sm` for things people read.
- **Display / headings & the wordmark**: `--font-display` (Iowan/Palatino/
  Georgia serif) — an editorial, organic note that says "field notebook," set
  with `font-[family-name:var(--font-display)]`.
- Weights: 600–700 for headings, 400–500 for body. No ultra-light.

## 4. Components

- **Button** (`components/ui/Button.tsx`): variants `primary` (green),
  `secondary` (white + hairline), `ghost`, `danger` (red text); sizes
  `sm`/`md`/`lg` (default `md` = 48px). `rounded-2xl`, visible focus ring.
- **Bottom sheet** (plant & cell detail): full-width on phones, ~420px panel on
  desktop; sticky header (title + close) and a sticky footer action bar with
  large buttons; scrollable middle. Closes on backdrop tap / Escape.
- **Cards / list rows**: surface background, hairline border, `rounded-2xl`,
  comfortable padding; whole row is tappable where it navigates.

## 5. Spacing & shape

- Base unit 4px; common steps 8 / 12 / 16 / 24.
- Radius: `rounded-xl` (12px) controls, `rounded-2xl` (16px) buttons/cards,
  full for the map FAB.
- Elevation: flat by default; sheets and the FAB get a soft `shadow-lg`. No
  heavy drop shadows.

## 6. Do / Don't

**Do** — big green primary actions; warm paper + green; serif for headings;
amber strictly for annotated (note/photo) cells; whole-row tap targets; `dvh` +
safe-area on full-height screens.

**Don't** — tiny secondary buttons crowded together; pure black text; cool/grey
chrome; translucent text over imagery without a halo; more than the two accent
hues (green + amber) plus danger red.
