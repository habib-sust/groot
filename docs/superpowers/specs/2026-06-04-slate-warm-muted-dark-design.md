# Slate + Warm-Muted Dark Theme — Design

**Date:** 2026-06-04
**Status:** Approved
**Project:** `groot` — lightweight Markdown viewer (Tauri v2 + Rust).
**Adjusts:** [warm dark variant](./2026-06-04-warm-dark-variant-design.md)
**Branch:** `feat/edit-menu-pruning-highlighting`.

## Goal

Refine the dark variant: keep a **slate background** (like the reference
screenshot) but use the **muted warm palette** — warm-yellow (amber) accents,
dusty-pink/mauve borders, sage-green callouts, and sage-toned code highlighting
(NOT One-Dark's purple/coral). The warm light theme is unchanged.

## Scope

### In scope
- Change the dark `@media (prefers-color-scheme: dark)` variables in
  `src/styles.css` from the warm-brown values to slate + warm-muted accents.
- Update the bundled `groot-warm-dark.tmTheme` background to the slate panel color
  (its syntax colors — sage/amber/rose — are unchanged).

### Out of scope
- Any change to the warm light theme.
- One-Dark / purple-coral code colors (explicitly not wanted).
- `markdown.rs` logic (still loads `groot-warm-dark.tmTheme`; tests unchanged).

## Dark page palette (replaces current warm-brown dark block)
```
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #2e3138;            /* slate (per screenshot) */
    --fg: #c8c4bb;            /* warm light gray */
    --heading: #ece8e0;
    --muted: #8d8f8c;
    --border: #6f585c;        /* dusty pink / mauve */
    --rule: #6f585c;
    --link: #d8a43e;          /* warm yellow / amber */
    --accent: #e9bd63;
    --code-bg: #24272c;       /* slate near-black panel */
    --inline-code-bg: #3a3e44;
    --callout-bg: #2c322b;    /* sage-tinted */
    --callout-border: #7f9670;/* sage */
  }
}
```
The light `:root` block stays unchanged. Exact shades may be nudged in GUI review.

## Code theme
`src-tauri/themes/groot-warm-dark.tmTheme`: change only the global `background`
from `#1F1D19` to `#24272C` (to match `--code-bg`). All token colors unchanged
(comment `#7D7565`, keyword/storage amber `#D8A43E`, string dusty-rose `#D98C9A`,
number terracotta `#D98A5A`, function `#7FA8CF`, type/class sage `#9CBF86`,
variable `#C9A06A`, operator `#9A9082`). The `dark_theme()` loader and
`syntax_css()` are unchanged.

## Files
- `src/styles.css` — dark `@media` variable values (above).
- `src-tauri/themes/groot-warm-dark.tmTheme` — background hex only.
- `markdown.rs`, `menu.rs`, `lib.rs`, `main.js` — unchanged.

## Testing
- Existing tests remain valid and green (the warm-dark string color `#d98c9a`
  is still present in `syntax_css()`; the dark `@media` block and light `#b06a7a`
  assertions still hold). No test changes needed.
- Appearance verified in the GUI smoke test (dark mode shows slate page + amber
  links + dusty-pink borders + sage callouts/code; light mode unchanged).

## Acceptance Criteria
- macOS light: warm cream theme (unchanged).
- macOS dark: slate page (`#2e3138`), slate near-black code panel, amber links,
  dusty-pink borders/rules, sage callouts, and sage/amber/rose code highlighting.
- `cargo test` passes unchanged; live OS appearance switch toggles the two themes.
