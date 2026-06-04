# Soft Warm "Sage & Rose" Theme — Design

**Date:** 2026-06-04
**Status:** Approved
**Project:** `groot` — lightweight Markdown viewer (Tauri v2 + Rust).
**Supersedes the look of:** [MarkText-style restyle](./2026-06-04-marktext-style-ui-restyle-design.md)
**Branch:** `feat/edit-menu-pruning-highlighting`.

## Goal

Replace the OS-adaptive slate/One-Dark theming with a single fixed, soft, muted
theme: warm cream page, warm-yellow (amber) accents, dusty-pink borders, and sage
green for callouts and code blocks, with a bundled muted-light syntax theme.

## Scope

### In scope
- One fixed theme regardless of OS appearance — remove the `prefers-color-scheme`
  light/dark split in `styles.css`.
- Warm/muted palette (below) for page chrome, links, borders, callouts.
- A bundled muted-light syntax `.tmTheme` on a sage code panel; remove the
  One-Dark theme.
- Simplify `syntax_css()` to emit the single theme's CSS (no dark `@media` block).

### Out of scope (deferred)
- Any dark-mode variant / OS adaptation.
- A user-facing theme switcher or multiple themes.
- Bundled web-fonts.

## Palette (page chrome)
Single `:root` block in `src/styles.css` (no media query):
- `--bg: #FAF5EE` (warm cream)
- `--fg: #4B4540` (soft warm gray) · `--heading: #33302C` · `--muted: #8C857A`
- `--border: #DCC3BE` (dusty pink) — used for `h1`/`h2` underline, `hr`, table borders
- `--link: #B5841F` (warm amber, underlined) · `--accent` (hover) `#8F6716`
- `--callout-bg: #EBF0E4` (sage tint) · `--callout-border: #9CAE8A` (sage)
- `--code-bg: #ECF0E6` (sage tint, distinct from page) · `--inline-code-bg: #E8EEDD`

Blockquotes become sage "callouts": sage left border + subtle sage background +
muted text. Tables/`hr`/heading underlines use the dusty-pink border. Links are
amber and underlined. Exact shades may be nudged during GUI review.

## Code syntax theme
New bundled asset `src-tauri/themes/groot-warm.tmTheme` (a light TextMate theme),
background `#ECF0E6`, foreground `#4B4540`:
- comment `#9AA08C` (italic)
- keyword / storage — warm amber `#B5841F`
- string — dusty rose `#B06A7A`
- constant / number — terracotta `#BF6E3F`
- function — soft blue `#5C7FA3`
- type / class — sage green `#6E8E5E`
- variable — warm brown `#8A6D3B`
- operator / punctuation — `#6F685E`

The highlighting pipeline (`parse_markdown` → `ClassedHTMLGenerator`, `stx-` class
prefix) is unchanged — only the theme that colors the classes changes.

## Rust changes (`markdown.rs`)
- Replace the One-Dark bundling: `include_bytes!("../themes/groot-warm.tmTheme")`,
  loaded once into a `OnceLock<Theme>` (helper renamed to `theme()` or similar),
  with a built-in fallback (e.g. `InspiredGitHub`) if parsing ever fails.
- `syntax_css()` returns the single theme's CSS via
  `css_for_theme_with_class_style(theme(), CLASS_STYLE)` — **no** light/dark split,
  **no** `@media (prefers-color-scheme: dark)` wrapper.
- Remove the now-unused `theme_set()`/`InspiredGitHub`/`base16-ocean.dark` paths if
  they are no longer referenced (keep a built-in only if used as the parse-failure
  fallback).
- Delete `src-tauri/themes/onedark.tmTheme`.

## Unchanged
`menu.rs` (window title), `lib.rs`, `src/main.js` (still injects `syntax_css` into
a `<style>` and renders the sample) — no changes needed.

## Error Handling
- If the bundled theme fails to parse, fall back to a built-in theme so
  highlighting still works and `syntax_css()` is non-empty.

## Testing
- Replace the prior `syntax_css_has_light_and_dark` and
  `dark_theme_uses_onedark_palette` tests with:
  - `syntax_css_uses_warm_theme`: `syntax_css()` (lowercased) contains the
    dusty-rose string hex `#b06a7a` (proves the bundled warm theme loaded).
  - `syntax_css_has_no_dark_media`: `syntax_css()` does NOT contain
    `prefers-color-scheme` (single fixed theme).
- Existing markdown/highlighting/sanitization tests remain green.
- Visual appearance verified in the GUI smoke test.

## Acceptance Criteria
- The app shows the warm cream theme regardless of OS light/dark setting.
- Code blocks render on a sage panel with the muted palette (amber keywords,
  dusty-rose strings, sage types).
- Blockquotes render as sage callouts; borders/rules are dusty pink; links amber.
- `cargo test` passes (with the updated theme tests); `parse_markdown` still
  strips `<script>`.
