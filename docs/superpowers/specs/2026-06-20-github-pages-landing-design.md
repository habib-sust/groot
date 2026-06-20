# GitHub Pages landing page — design

**Date:** 2026-06-20
**Status:** Approved

## Goal

A professional, single-page marketing/landing site for `groot` served via GitHub
Pages. It presents feature details, install instructions, and a few screenshots,
carrying the app's own editorial visual identity onto the web.

## Hosting

- **Deploy from branch**, `main`, `/docs` folder (GitHub Pages "deploy from a
  branch" mode — serves repo root or `/docs` only).
- Site entry point is therefore `docs/index.html`, living alongside the existing
  `docs/superpowers/` specs and `docs/releasing.md`.
- Add `docs/.nojekyll` so Pages serves the hand-built static files as-is and does
  **not** run Jekyll over the spec/plan markdown in `docs/superpowers/`.
- Published URL: `https://habib-sust.github.io/groot/`.
- All asset references must be **relative** (e.g. `assets/hero.png`, `styles.css`)
  so they resolve under the `/groot/` path prefix.

## Stack

- Hand-built static page: `docs/index.html` + `docs/styles.css`. No framework, no
  build step (matches the project's vanilla-JS ethos).
- Screenshots in `docs/assets/`.
- Fonts: **Fraunces** (display) + **Newsreader** (body) from Google Fonts, with
  the same system-serif fallbacks the app uses
  (`"Iowan Old Style", Georgia, "Times New Roman", serif`).
- Icon: reuse the `app-icon.svg` gradient mark inline.
- Small per-feature glyphs as inline SVG in the accent color.
- A tiny inline `<script>` only for click-to-copy on the install command.

## Visual identity (editorial — match the app)

Carry the app palette and type system to the web. The page ships in both themes
via `prefers-color-scheme` (no manual toggle needed).

| Token | Light (paper-cream) | Dark (slate) |
| --- | --- | --- |
| `--bg` | `#f5f1e6` | `#282d35` |
| `--fg` | `#353026` | `#c9d1d9` |
| `--accent` | `#357a4f` | `#58a6ff` |

- Brand gradient (from the icon) used for accents/washes:
  `#10B981 → #06B6D4 → #3B82F6`.
- Display type: Fraunces. Body type: Newsreader.

## Page structure (top → bottom)

1. **Hero** — gradient icon, "groot" in Fraunces, tagline ("A lightweight
   Markdown desktop app with an in-place WYSIWYG editor"), two CTAs:
   - Primary: `brew install --cask habib-sust/groot/groot` with **click-to-copy**.
   - Secondary: **Download .dmg** → latest GitHub Release
     (`https://github.com/habib-sust/groot/releases/latest`).
   - Subtle emerald→cyan→blue gradient wash behind the hero.
   - Hero screenshot of the editor directly below.
2. **Feature grid** — cards from the README, each with a small inline-SVG accent
   glyph: in-place WYSIWYG; live reload; outline + scroll-spy; command palette
   (⌘K); find in-document; export HTML / print-PDF; themes & typography; menu-bar
   (tray) icon; drag-and-drop / Open Recent; save/new with unsaved-changes guard.
3. **Screenshot showcase** — larger captioned shots framed in subtle macOS-style
   window chrome: (a) editor, light theme; (b) command palette open; (c) outline
   sidebar + dark theme.
4. **Install** — brew command prominent; note it is Apple Developer-ID signed +
   notarized (launches normally, no Gatekeeper workaround); plus
   clone/dev/build instructions for contributors.
5. **Keyboard shortcuts** — the README shortcut table styled with `<kbd>` keys.
6. **Footer** — tech-stack credits (Tauri v2, Milkdown Crepe, pulldown-cmark,
   syntect, ammonia, notify), repo link, MIT license.

## Screenshots to capture

Run the app in dev (`npm run tauri dev`) with a rich sample `.md` open, then
capture (both themes represented), saved to `docs/assets/`:

1. `hero.png` — editor in light theme (the showcase shot).
2. `command-palette.png` — ⌘K command palette open.
3. `outline-dark.png` — outline sidebar visible, dark theme.

Optional 4th if useful: code block with syntax highlighting + copy button.

## Responsiveness & a11y

- Mobile-first responsive layout; feature grid collapses to one column.
- Semantic HTML (`<header>`, `<main>`, `<section>`, `<footer>`), alt text on every
  screenshot, focus-visible styles on interactive elements, sufficient contrast in
  both themes.
- Copy-to-clipboard has an accessible button label and a visible "Copied!" state.

## Out of scope (YAGNI)

- No analytics, no cookie banner, no newsletter signup.
- No manual light/dark toggle on the page (follow OS).
- No multi-page site — single `index.html`.
- No custom domain (use the default `github.io` URL).
