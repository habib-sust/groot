# Warm Dark Variant (OS-adaptive) — Design

**Date:** 2026-06-04
**Status:** Approved
**Project:** `groot` — lightweight Markdown viewer (Tauri v2 + Rust).
**Builds on / adjusts:** [warm Sage & Rose theme](./2026-06-04-warm-sage-rose-theme-design.md)
**Branch:** `feat/edit-menu-pruning-highlighting`.

## Problem

The warm theme was implemented as a single fixed (light) theme, so the app stays
light even when macOS is in dark mode. We want it to follow the OS, with a
warm-dark variant that matches the existing warm light look.

## Goal

Re-introduce OS-adaptive theming (`prefers-color-scheme`). Keep the current warm
light theme unchanged; add a cohesive warm-dark variant (deep warm charcoal page,
same amber/sage/dusty-rose accent family, dark code panel) that activates under
macOS dark mode.

## Scope

### In scope
- Re-add a `@media (prefers-color-scheme: dark)` block to `src/styles.css` with
  warm-dark variables (light `:root` unchanged).
- Bundle a second syntax theme `groot-warm-dark.tmTheme`.
- `syntax_css()` emits the light theme + a dark theme wrapped in the
  `prefers-color-scheme: dark` media query (restores the split, now warm-dark).

### Out of scope (deferred)
- A manual in-app theme toggle (we follow the OS).
- Any change to the warm light theme.

## Warm-dark page palette
Re-add to `src/styles.css`:
```
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #26231f;
    --fg: #d6ccbe;
    --heading: #efe7da;
    --muted: #978d7e;
    --border: #574c44;
    --rule: #574c44;
    --link: #d8a43e;
    --accent: #e9bd63;
    --code-bg: #1f1d19;
    --inline-code-bg: #353029;
    --callout-bg: #29302a;
    --callout-border: #7f9670;
  }
}
```
The light `:root` block stays exactly as it is now. Exact dark shades may be
nudged during GUI review.

## Warm-dark code theme
New bundled asset `src-tauri/themes/groot-warm-dark.tmTheme` (light TextMate plist
format, dark background), background `#1F1D19`, foreground `#D6CCBE`:
- comment `#7D7565` (italic)
- keyword / storage — amber `#D8A43E`
- string — dusty rose `#D98C9A`
- constant / number — terracotta `#D98A5A`
- function — soft blue `#7FA8CF`
- type / class — sage `#9CBF86`
- variable — `#C9A06A`
- operator / punctuation — `#9A9082`

Same `stx-` class prefix as the light theme, so both map onto the spans
`parse_markdown` already emits.

## Rust changes (`markdown.rs`)
- Keep the existing warm light loader `theme()` (loads `groot-warm.tmTheme`).
- Add `const WARM_DARK_TMTHEME: &[u8] = include_bytes!("../themes/groot-warm-dark.tmTheme");`
  and a `dark_theme() -> &'static Theme` (cached in `OnceLock`, fallback to a
  built-in dark theme such as `base16-ocean.dark` if parsing fails).
- `syntax_css()` returns:
  `{light}\n@media (prefers-color-scheme: dark) {{\n{dark}\n}}\n`
  where `light = css_for_theme_with_class_style(theme(), CLASS_STYLE)` and
  `dark = css_for_theme_with_class_style(dark_theme(), CLASS_STYLE)`.

## Unchanged
`menu.rs`, `lib.rs`, `src/main.js` — no changes (the frontend already injects
whatever `syntax_css()` returns into a `<style>`).

## Error Handling
- If either bundled theme fails to parse, fall back to a built-in theme so
  highlighting still works and `syntax_css()` stays non-empty.

## Testing (`markdown.rs`)
- Replace `syntax_css_has_no_dark_media` with `syntax_css_has_dark_media`:
  `syntax_css()` contains `prefers-color-scheme`.
- Keep `syntax_css_uses_warm_theme`: contains the light string color `#b06a7a`.
- Add `syntax_css_dark_uses_warm_dark`: contains the dark string color `#d98c9a`
  (proves the dark theme loaded, not a fallback).
- Existing markdown/highlighting/sanitization/recent tests stay green.
- Light and dark appearance verified in the GUI smoke test.

## Acceptance Criteria
- In macOS light mode: the warm cream theme (unchanged).
- In macOS dark mode: the warm-dark theme (charcoal page, dark code panel,
  brighter amber/sage/rose syntax), switching live when the OS appearance changes.
- `cargo test` passes (with the updated dark-media + dark-color tests);
  `parse_markdown` still strips `<script>`.
