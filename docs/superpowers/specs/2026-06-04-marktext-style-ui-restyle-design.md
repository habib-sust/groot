# MarkText-style UI Restyle — Design

**Date:** 2026-06-04
**Status:** Approved
**Project:** `groot` — lightweight Markdown viewer (Tauri v2 + Rust).
**Builds on:** [syntax highlighting + Edit menu + pruning](./2026-06-04-edit-menu-pruning-syntax-highlighting-design.md)
**Branch:** `feat/edit-menu-pruning-highlighting` (this restyle is added to the same branch).

## Goal

Restyle the viewer to match a MarkText-style look (per the user's reference
screenshot): a clean centered reading column, comfortable typography, a slate
dark theme, a near-black code panel with a One-Dark-style syntax palette, and
the open file's name shown in the native window title.

## Scope

### In scope
- Retune light/dark CSS theme variables + typography, links, and section rules.
- Slate dark palette: page `#2e3138`, near-black code panel `#21242b`.
- Bundle a One-Dark-style `.tmTheme` and use it for the dark code theme; keep
  `InspiredGitHub` for light.
- Set the native window title to the open file's name on open.

### Out of scope (deferred)
- Bundled web-fonts (use the system font stack; stay offline).
- User-selectable / additional themes; a theme picker.
- Overlay or frameless custom title bar (the native title is used).
- Reading-width or zoom controls.

## Visual Design

### Typography & layout (both themes)
- Centered content column, `max-width: 860px` (unchanged), generous padding.
- System sans-serif body, ~16–17px, line-height ~1.6–1.7.
- Headings bold; `h1`/`h2` keep a subtle bottom border. Heading color near-white
  in dark, near-black in light.
- Links: muted (body-colored) and underlined — not bright blue.
- A subtle horizontal rule (`hr`) between sections.
- Tables: bordered cells, bold header row (unchanged structure, themed colors).

### Dark theme variables (`@media (prefers-color-scheme: dark)`)
- `--bg: #2e3138` (page slate)
- `--fg: #abb2bf` (body), headings `#e6e6e6`
- `--code-bg: #21242b` (near-black code panel; distinct from page)
- `--border: #3a3f47`
- inline-code background slightly lighter than the panel
- `--accent` (links/hover) tuned to a muted tone

### Light theme variables (`:root`)
- `--bg: #ffffff`, `--fg: #24292f`, `--code-bg: #f6f8fa`, `--border: #d0d7de`
  (close to current — clean GitHub-like light).

Exact shades may be nudged during the GUI review; the values above are the
starting target.

## Code Highlighting Theme

- Add a bundled One-Dark-style TextMate theme asset at
  `src-tauri/themes/onedark.tmTheme` (purple keywords, coral strings, light
  identifiers, near-black background).
- In `markdown.rs`, load it once (cached in a `OnceLock<Theme>`) via
  `include_bytes!` + `syntect::highlighting::ThemeSet::load_from_reader`
  (exact loader verified against the installed syntect during implementation).
- `syntax_css()` generates the dark `@media (prefers-color-scheme: dark)` block
  from the bundled One-Dark theme and the light rules from the built-in
  `InspiredGitHub`. The shared `stx-` class prefix is unchanged, so generated CSS
  matches the spans emitted by `parse_markdown`.
- Highlighting of the code text itself (`parse_markdown` → `ClassedHTMLGenerator`)
  is theme-independent (classes only) and does not change.

## Window Title

When a file is opened (via the dialog or a recent item), Rust sets the native
window title to the file's base name (e.g. `BrushSync_App_Specification.md`) using
the main webview window handle inside `on_file_chosen` (in `menu.rs`). On launch
the title stays `Groot — Markdown Viewer`. A failed/missing open does not change
the title. No new capability/permission is required (the title is set Rust-side).

## Files Touched
- `src/styles.css` — retune light/dark variables, typography, links, `hr`.
- `src-tauri/themes/onedark.tmTheme` — new bundled theme asset.
- `src-tauri/src/markdown.rs` — load the bundled dark theme; `syntax_css()` uses
  One-Dark (dark) + InspiredGitHub (light).
- `src-tauri/src/menu.rs` — set the window title in `on_file_chosen`.

## Error Handling
- If the bundled theme fails to load (shouldn't happen — it's compiled in), fall
  back to a built-in dark theme so highlighting still works; `syntax_css()` never
  returns empty for the dark block in the normal case.
- Setting the window title is best-effort (`let _ =`); a failure does not affect
  rendering.

## Testing
- Existing `syntax_css_has_light_and_dark` test still passes (dark `@media` block
  present).
- New test: the dark portion of `syntax_css()` contains a One-Dark signature color
  (e.g. the coral string hex or the `#abb2bf` foreground), proving the bundled
  theme loaded rather than a default.
- Existing markdown/highlighting/sanitization tests remain green.
- CSS/typography and the window-title behavior are verified in the GUI smoke test.

## Acceptance Criteria
- In dark OS appearance, the page background is the slate tone and code blocks
  render as a darker near-black panel with One-Dark-style colors (purple
  keywords, coral strings).
- In light appearance, a clean white reading view.
- Body/heading typography, muted underlined links, and section rules match the
  MarkText-style reference.
- Opening a file sets the window title to that file's name; the launch view shows
  `Groot — Markdown Viewer`.
- `cargo test` passes (existing tests + the new theme-color assertion).
