# Slash / Block Menu — Configure & Polish — Design

**Date:** 2026-06-05
**Status:** Approved
**Project:** `groot` — Markdown editor (Tauri v2 + Rust, Vite, Milkdown Crepe).

## Goal
Tailor Crepe's already-enabled slash/block menu so every offered block works in the
editor **and** survives Export/Print, and confirm it reads correctly in both themes.

## Context
Crepe enables the `BlockEdit` feature (the `/` block menu + drag handle) by default,
and `block-edit.css` is already imported via `@milkdown/crepe/theme/common/style.css`.
groot never disables it, so the slash menu, drag handle, LaTeX math, tables, and the
selection toolbar are **already active**. This is therefore a configuration + polish
task, not a build.

## Decisions
- **Remove two slash-menu items** that are inconsistent with groot's "what you see is
  what you export" principle:
  - **Image** — Crepe inserts images by URL only; groot has no local-file/paste-to-disk
    pipeline. Drop the menu item. (URL images via raw markdown still render and export.)
  - **Math** — renders live in the editor but is lost in Export/Print (those go through
    `pulldown-cmark`, which has no math). Drop the menu item.
- **Disable the LaTeX feature entirely** (`features: { [CrepeFeature.Latex]: false }`)
  so typing `$…$` does not produce editor-only math that disappears on export — editor
  and export stay consistent.
- **Keep everything else:** text, h1–h6, quote, divider (`textGroup`); bullet / ordered /
  task lists (`listGroup`); code block + table (`advancedGroup`); and the drag handle.
- **Keep the ImageBlock feature on** (URL images render + export fine); we simply do not
  advertise image insertion in the menu.

## Implementation

### Frontend (`src/main.js`)
`render()` already constructs Crepe with a `featureConfigs` object (for
`CrepeFeature.CodeMirror.onCopy`). Extend that constructor:
- Add `features: { [CrepeFeature.Latex]: false }` to disable math.
- Add `featureConfigs[CrepeFeature.BlockEdit]` with:
  - `advancedGroup: { image: null, math: null }` — drops those two items while keeping
    `codeBlock` and `table` (the per-item config accepts `null` to remove an item).
- `CrepeFeature` is already imported.

No other JS changes; the drag handle and remaining groups are Crepe defaults.

### Theme (`src/styles.css`)
The menu popover and drag handle are already themed through the `--crepe-color-*`
bridge on `#viewport .milkdown`. Verify the menu's surface / hover / selected / text
colors read well in both light (warm cream) and dark (slate); add targeted overrides
for the block-edit menu classes only if a specific color reads wrong. No structural CSS
expected.

## Error / Edge Handling
- Disabling LaTeX means `$…$` stays literal text (consistent with export). Acceptable.
- Removing the Image/Math menu items does not affect parsing of existing documents
  (URL image markdown still renders via ImageBlock; literal `$…$` stays text).

## Files
- Modify: `src/main.js` (Crepe `features` + `BlockEdit` featureConfig).
- Modify (only if needed): `src/styles.css` (block-edit menu color tweaks).

## Testing
- `npm run build` clean; Rust unchanged (`cargo test` 24).
- GUI: typing `/` on an empty line shows the configured items only — text/headings/
  quote/divider, lists, code block, table — with **no Image or Math**; selecting each
  inserts the correct block; the drag handle reorders blocks; `$x$` stays literal;
  Export/Print of a doc using these blocks renders faithfully; the menu is legible in
  light and dark.

## Acceptance Criteria
- The `/` menu offers only blocks that render in the editor and export faithfully
  (no Image, no Math); LaTeX feature is off so no editor-only math exists.
- Tables, code blocks, lists, headings, quote, divider, and the drag handle all work.
- The menu is themed consistently in both light and dark.
- `cargo test` passes (24); `npm run build` succeeds.
