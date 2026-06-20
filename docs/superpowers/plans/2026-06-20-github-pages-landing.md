# GitHub Pages Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a professional, single-page GitHub Pages landing site for `groot` that presents features, install instructions, and screenshots, carrying the app's editorial visual identity onto the web.

**Architecture:** Hand-built static page (`docs/index.html` + `docs/styles.css`, no framework, no build step) served via GitHub Pages "deploy from branch" mode (`main` → `/docs`). A `.nojekyll` file disables Jekyll so the existing `docs/superpowers/` markdown is left untouched. The page ships in both the app's themes via `prefers-color-scheme`. Visual polish should be produced with the **frontend-design** skill within the editorial direction; this plan locks down the content, structure, config, and exact strings that must be correct.

**Tech Stack:** HTML5, CSS (custom properties, `prefers-color-scheme`, fl/grid), tiny inline JS for click-to-copy, Google Fonts (Fraunces + Newsreader), inline SVG.

## Global Constraints

- Site root is `docs/index.html`; GitHub Pages mode = deploy from `main` branch, `/docs` folder. Published URL: `https://habib-sust.github.io/groot/`.
- All asset/href references inside the site are **relative** (`styles.css`, `assets/hero.png`) so they resolve under the `/groot/` path prefix. Never use absolute root paths (`/styles.css`).
- Theme tokens (verbatim from spec):
  - Light: `--bg: #f5f1e6` · `--fg: #353026` · `--accent: #357a4f`
  - Dark: `--bg: #282d35` · `--fg: #c9d1d9` · `--accent: #58a6ff`
  - Brand gradient: `#10B981 → #06B6D4 → #3B82F6`
- Fonts: Fraunces (display), Newsreader (body); fallback stack `"Iowan Old Style", Georgia, "Times New Roman", serif`.
- Exact install command: `brew install --cask habib-sust/groot/groot`
- Exact download link: `https://github.com/habib-sust/groot/releases/latest`
- Exact repo link: `https://github.com/habib-sust/groot`
- License: MIT.
- macOS-only app; copy must not imply Windows/Linux builds exist.
- No analytics, no manual theme toggle, no multi-page site (YAGNI per spec).

**Verification convention (no JS test harness in this project):** "render check" = run `python3 -m http.server 8000 --directory docs` (background), load `http://localhost:8000/` (use the `verify` skill / a screenshot), confirm the named elements are visible and correct, then stop the server. Each task ends by committing.

---

### Task 1: Scaffold — document skeleton, theme tokens, Pages config

**Files:**
- Create: `docs/index.html`
- Create: `docs/styles.css`
- Create: `docs/.nojekyll` (empty file)

**Interfaces:**
- Produces: a valid HTML document with `<header>`, `<main>`, and named `<section>` placeholders (`#hero`, `#features`, `#showcase`, `#install`, `#shortcuts`) plus `<footer>`; `styles.css` exposing `:root` and `@media (prefers-color-scheme: dark)` token blocks that later tasks style against.

- [ ] **Step 1: Create `docs/.nojekyll`** (empty file — disables Jekyll over `docs/superpowers/`).

```bash
touch docs/.nojekyll
```

- [ ] **Step 2: Create `docs/index.html` skeleton**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>groot — a lightweight Markdown desktop app</title>
  <meta name="description" content="groot is a lightweight macOS Markdown desktop app with an in-place WYSIWYG editor — write and read Markdown as rendered rich text." />
  <!-- Open Graph -->
  <meta property="og:title" content="groot — a lightweight Markdown desktop app" />
  <meta property="og:description" content="In-place WYSIWYG Markdown editing for macOS. Built with Tauri v2 and Milkdown Crepe." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://habib-sust.github.io/groot/" />
  <link rel="icon" type="image/svg+xml" href="assets/icon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header id="hero"><!-- Task 3 --></header>
  <main>
    <section id="features"><!-- Task 4 --></section>
    <section id="showcase"><!-- Task 5 --></section>
    <section id="install"><!-- Task 6 --></section>
    <section id="shortcuts"><!-- Task 7 --></section>
  </main>
  <footer><!-- Task 8 --></footer>
</body>
</html>
```

- [ ] **Step 3: Create `docs/styles.css` base**

```css
:root {
  --bg: #f5f1e6;
  --fg: #353026;
  --accent: #357a4f;
  --surface: #fffdf7;
  --border: rgba(53, 48, 38, 0.14);
  --muted: rgba(53, 48, 38, 0.62);
  --grad: linear-gradient(120deg, #10B981, #06B6D4, #3B82F6);
  --font-display: "Fraunces", "Iowan Old Style", Georgia, "Times New Roman", serif;
  --font-text: "Newsreader", "Iowan Old Style", Georgia, "Times New Roman", serif;
  --maxw: 1080px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #282d35;
    --fg: #c9d1d9;
    --accent: #58a6ff;
    --surface: #2f353e;
    --border: rgba(201, 209, 218, 0.14);
    --muted: rgba(201, 209, 218, 0.6);
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-text);
  font-size: 18px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3 { font-family: var(--font-display); line-height: 1.1; }
a { color: var(--accent); }
main > section, header { padding: 0 24px; }
.wrap { max-width: var(--maxw); margin: 0 auto; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

- [ ] **Step 4: Render check** — serve `docs/` and load `http://localhost:8000/`. Expected: blank-ish page in the cream theme (or slate if OS is dark), no console errors, fonts requested in the network tab.

- [ ] **Step 5: Commit**

```bash
git add docs/index.html docs/styles.css docs/.nojekyll
git commit -m "feat(site): 🏗️ scaffold landing page skeleton + theme tokens"
```

---

### Task 2: Capture screenshots & icon asset

**Files:**
- Create: `docs/assets/icon.svg` (copy of `app-icon.svg`)
- Create: `docs/assets/hero.png`
- Create: `docs/assets/command-palette.png`
- Create: `docs/assets/outline-dark.png`

**Interfaces:**
- Produces: image files referenced by later tasks at exact relative paths above.

- [ ] **Step 1: Copy the icon**

```bash
mkdir -p docs/assets && cp app-icon.svg docs/assets/icon.svg
```

- [ ] **Step 2: Create a rich sample Markdown file for screenshots** (temporary, not committed) at `/tmp/groot-sample.md` containing a document that exercises headings, a paragraph, a bulleted list, a table, a blockquote, and a fenced code block with a language tag (e.g. a `rust` snippet) so syntax highlighting shows.

- [ ] **Step 3: Run the app** — `PATH="$HOME/.cargo/bin:$PATH" npm run tauri dev` (background). Wait for the native window. Open `/tmp/groot-sample.md`.

- [ ] **Step 4: Capture the three screenshots** at a generous window size (≥1200px wide). Save as PNG to `docs/assets/`:
  1. `hero.png` — editor showing the sample doc, **light** theme.
  2. `command-palette.png` — press ⌘K, palette open over the doc.
  3. `outline-dark.png` — switch to **dark** theme, toggle the outline sidebar (⌘⇧O) so it is visible.

  (Use macOS `screencapture -o -x -R<x,y,w,h> file.png` targeting the app window, or the window-capture form. Crop out desktop background; keep the app window chrome.)

- [ ] **Step 5: Sanity-check the images** — confirm each PNG is non-empty and shows the intended state.

```bash
ls -la docs/assets/ && file docs/assets/*.png
```

- [ ] **Step 6: Commit**

```bash
git add docs/assets/
git commit -m "feat(site): 📸 add app screenshots + icon asset"
```

---

### Task 3: Hero section

**Files:**
- Modify: `docs/index.html` (`<header id="hero">`)
- Modify: `docs/styles.css` (append hero styles)

**Interfaces:**
- Consumes: `assets/icon.svg`, `assets/hero.png` (Task 2); theme tokens (Task 1).
- Produces: a copy-to-clipboard button with `id="copy-btn"` and a `<code id="brew-cmd">` (the inline `<script>` at the end of `<body>` wires these — added here).

- [ ] **Step 1: Replace the `<header id="hero">` content**

```html
<header id="hero">
  <div class="wrap hero">
    <img class="hero-icon" src="assets/icon.svg" width="96" height="96" alt="groot app icon" />
    <h1>groot</h1>
    <p class="tagline">A lightweight Markdown desktop app with an in-place <strong>WYSIWYG editor</strong> — write and read Markdown as rendered rich text. No split-pane, no mode switch.</p>
    <div class="cta">
      <div class="copy-field">
        <code id="brew-cmd">brew install --cask habib-sust/groot/groot</code>
        <button id="copy-btn" type="button" aria-label="Copy install command">Copy</button>
      </div>
      <a class="btn-secondary" href="https://github.com/habib-sust/groot/releases/latest">Download .dmg</a>
    </div>
    <p class="hero-note">macOS · Apple Developer-ID signed &amp; notarized</p>
    <img class="hero-shot" src="assets/hero.png" alt="groot editor showing a Markdown document rendered as rich text" />
  </div>
</header>
```

- [ ] **Step 2: Add the inline copy-to-clipboard script** before `</body>`

```html
<script>
  document.getElementById("copy-btn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    await navigator.clipboard.writeText(document.getElementById("brew-cmd").textContent.trim());
    const prev = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = prev; }, 1500);
  });
</script>
```

- [ ] **Step 3: Append hero styles to `styles.css`** — use the **frontend-design** skill for polish. Required outcomes: centered hero, gradient (`--grad`) wash behind the header, Fraunces `h1` large (≥4rem desktop), `.copy-field` shows the command in a monospace pill with the Copy button, `.hero-shot` has a soft shadow + rounded corners and a `max-width: 100%`. Reference baseline:

```css
#hero { position: relative; text-align: center; padding-top: 80px; padding-bottom: 40px; overflow: hidden; }
#hero::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 360px; background: var(--grad); opacity: 0.10; z-index: -1; }
.hero h1 { font-size: clamp(3rem, 8vw, 5rem); margin: 16px 0 8px; }
.tagline { font-size: 1.25rem; color: var(--muted); max-width: 620px; margin: 0 auto 28px; }
.cta { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; align-items: center; }
.copy-field { display: inline-flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 6px 6px 6px 14px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.95rem; }
#copy-btn { border: 0; border-radius: 6px; padding: 8px 14px; background: var(--accent); color: #fff; cursor: pointer; font: inherit; }
.btn-secondary { display: inline-block; padding: 9px 18px; border: 1px solid var(--accent); border-radius: 8px; text-decoration: none; }
.hero-note { color: var(--muted); font-size: 0.9rem; margin: 18px 0 36px; }
.hero-shot { width: 100%; max-width: 920px; border-radius: 12px; box-shadow: 0 24px 60px rgba(0,0,0,0.22); border: 1px solid var(--border); }
```

- [ ] **Step 4: Render check** — load the page. Expected: icon, "groot" title, tagline, copy pill (clicking "Copy" shows "Copied!" then reverts), Download button, hero screenshot below. No console errors.

- [ ] **Step 5: Commit**

```bash
git add docs/index.html docs/styles.css
git commit -m "feat(site): ✨ hero with copy-to-clipboard install + download CTA"
```

---

### Task 4: Feature grid

**Files:**
- Modify: `docs/index.html` (`<section id="features">`)
- Modify: `docs/styles.css` (append feature-grid styles)

**Interfaces:**
- Consumes: theme tokens (Task 1).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Replace `<section id="features">` content** — one `.feature` card per item below. Each card: an inline SVG glyph (stroke `currentColor`, sized 24px, wrapped in `.feature-icon` colored `var(--accent)`), an `<h3>`, and a `<p>`. Cards (title — description):
  - **In-place WYSIWYG** — Markdown renders as you type — headings, lists, tables, fenced code with syntax highlighting. No raw-symbol mode switching.
  - **Live reload** — External changes to the open file are picked up automatically, and ignored while you have unsaved edits.
  - **Outline sidebar** — A document outline with scroll-spy (⌘⇧O) to jump around long files.
  - **Command palette** — Fuzzy-search and run any command with ⌘K.
  - **Find in document** — In-place search (⌘F) that highlights matches as you type.
  - **Export & print** — Export clean standalone HTML, or Print / save as PDF — both render without editor chrome.
  - **Themes & typography** — Warm paper-cream light and slate dark (or follow the system), in an editorial Fraunces + Newsreader type system.
  - **Menu-bar icon** — A macOS status-bar icon with quick actions: Show, New File, Open File…, and Quit.
  - **Open anywhere** — Open via the File menu, Open Recent (persisted), or drag-and-drop a `.md` file onto the window.
  - **Safe editing** — Save / Save As / New with unsaved-changes tracking and a close guard that prompts before discarding edits.

  Structure for one card (repeat per item; swap glyph paths — use simple line icons, e.g. from a public-domain set like Lucide, pasted inline):

```html
<div class="feature">
  <span class="feature-icon" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><!-- glyph paths --></svg></span>
  <h3>In-place WYSIWYG</h3>
  <p>Markdown renders as you type — headings, lists, tables, fenced code with syntax highlighting. No raw-symbol mode switching.</p>
</div>
```

  Wrap all cards: `<div class="wrap"><h2 class="section-title">Features</h2><div class="feature-grid">…cards…</div></div>`.

- [ ] **Step 2: Append feature-grid styles** (frontend-design skill for polish). Baseline:

```css
#features { padding-top: 64px; padding-bottom: 64px; }
.section-title { font-size: 2rem; text-align: center; margin: 0 0 36px; }
.feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; }
.feature { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 22px; }
.feature-icon { display: inline-flex; color: var(--accent); margin-bottom: 10px; }
.feature h3 { font-size: 1.15rem; margin: 0 0 6px; }
.feature p { margin: 0; color: var(--muted); font-size: 0.98rem; }
```

- [ ] **Step 3: Render check** — load the page. Expected: a responsive grid of 10 feature cards, each with a colored glyph, title, and description; collapses to one column at narrow widths.

- [ ] **Step 4: Commit**

```bash
git add docs/index.html docs/styles.css
git commit -m "feat(site): 🎴 feature grid"
```

---

### Task 5: Screenshot showcase

**Files:**
- Modify: `docs/index.html` (`<section id="showcase">`)
- Modify: `docs/styles.css` (append showcase styles)

**Interfaces:**
- Consumes: `assets/command-palette.png`, `assets/outline-dark.png`, and re-uses `assets/hero.png` (Task 2).

- [ ] **Step 1: Replace `<section id="showcase">` content** — three `<figure>` blocks, each wrapped in a faux macOS window frame (`.window` with a `.titlebar` containing three traffic-light dots) and a `<figcaption>`:
  1. `assets/hero.png` — caption "Write Markdown as rendered rich text — light theme."
  2. `assets/command-palette.png` — caption "Run any command with the ⌘K palette."
  3. `assets/outline-dark.png` — caption "Outline sidebar with scroll-spy — dark theme."

```html
<div class="wrap">
  <h2 class="section-title">A closer look</h2>
  <figure class="shot">
    <div class="window">
      <div class="titlebar"><span></span><span></span><span></span></div>
      <img src="assets/command-palette.png" alt="groot command palette open over a document" />
    </div>
    <figcaption>Run any command with the ⌘K palette.</figcaption>
  </figure>
  <!-- repeat for the other two -->
</div>
```

- [ ] **Step 2: Append showcase styles** (frontend-design for polish). Baseline:

```css
#showcase { padding-top: 64px; padding-bottom: 64px; }
.shot { margin: 0 0 56px; }
.window { border-radius: 12px; overflow: hidden; border: 1px solid var(--border); box-shadow: 0 18px 50px rgba(0,0,0,0.18); background: var(--surface); }
.titlebar { display: flex; gap: 8px; padding: 10px 14px; background: color-mix(in srgb, var(--surface), var(--fg) 6%); }
.titlebar span { width: 12px; height: 12px; border-radius: 50%; background: var(--border); }
.titlebar span:nth-child(1) { background: #ff5f57; }
.titlebar span:nth-child(2) { background: #febc2e; }
.titlebar span:nth-child(3) { background: #28c840; }
.window img { display: block; width: 100%; }
figcaption { text-align: center; color: var(--muted); margin-top: 14px; font-size: 0.98rem; }
```

- [ ] **Step 3: Render check** — load the page. Expected: three framed screenshots with traffic-light titlebars and captions; images fill the frame width.

- [ ] **Step 4: Commit**

```bash
git add docs/index.html docs/styles.css
git commit -m "feat(site): 🖼️ screenshot showcase with window frames"
```

---

### Task 6: Install section

**Files:**
- Modify: `docs/index.html` (`<section id="install">`)
- Modify: `docs/styles.css` (append install styles)

- [ ] **Step 1: Replace `<section id="install">` content**

```html
<div class="wrap install">
  <h2 class="section-title">Install</h2>
  <p class="install-lead">Install on macOS with Homebrew:</p>
  <pre class="code-block"><code>brew install --cask habib-sust/groot/groot</code></pre>
  <p class="install-note">groot is signed with an Apple Developer ID and notarized by Apple, so it launches normally — no Gatekeeper workaround needed. You can also <a href="https://github.com/habib-sust/groot/releases/latest">download the .dmg</a> directly.</p>

  <h3 class="build-title">Build from source</h3>
  <p>Requires <a href="https://www.rust-lang.org/tools/install">Rust</a> and <a href="https://nodejs.org/">Node.js</a>.</p>
  <pre class="code-block"><code>git clone https://github.com/habib-sust/groot.git
cd groot
npm install
npm run tauri dev      # launch the app
npm run tauri build    # produce a distributable bundle</code></pre>
</div>
```

- [ ] **Step 2: Append install styles** (frontend-design for polish). Baseline:

```css
#install { padding-top: 64px; padding-bottom: 64px; }
.install { max-width: 760px; }
.install-lead { text-align: center; }
.code-block { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px 18px; overflow-x: auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9rem; line-height: 1.5; }
.install-note { color: var(--muted); font-size: 0.95rem; }
.build-title { margin-top: 40px; }
```

- [ ] **Step 3: Render check** — load the page. Expected: brew command in a code block, notarization note with a working `.dmg` link, build-from-source block.

- [ ] **Step 4: Commit**

```bash
git add docs/index.html docs/styles.css
git commit -m "feat(site): 📦 install section (brew + build from source)"
```

---

### Task 7: Keyboard shortcuts table

**Files:**
- Modify: `docs/index.html` (`<section id="shortcuts">`)
- Modify: `docs/styles.css` (append shortcut styles)

- [ ] **Step 1: Replace `<section id="shortcuts">` content** — a table styling shortcut keys with `<kbd>`. Rows (verbatim from README): Open File ⌘O · New ⌘N · Save ⌘S · Save As ⌘⇧S · Find ⌘F · Toggle Outline ⌘⇧O · Toggle Status Bar ⌘/ · Command Palette ⌘K · Print ⌘P.

```html
<div class="wrap shortcuts">
  <h2 class="section-title">Keyboard shortcuts</h2>
  <table>
    <thead><tr><th>Action</th><th>Shortcut</th></tr></thead>
    <tbody>
      <tr><td>Open File</td><td><kbd>⌘</kbd><kbd>O</kbd></td></tr>
      <tr><td>New</td><td><kbd>⌘</kbd><kbd>N</kbd></td></tr>
      <tr><td>Save</td><td><kbd>⌘</kbd><kbd>S</kbd></td></tr>
      <tr><td>Save As</td><td><kbd>⌘</kbd><kbd>⇧</kbd><kbd>S</kbd></td></tr>
      <tr><td>Find</td><td><kbd>⌘</kbd><kbd>F</kbd></td></tr>
      <tr><td>Toggle Outline</td><td><kbd>⌘</kbd><kbd>⇧</kbd><kbd>O</kbd></td></tr>
      <tr><td>Toggle Status Bar</td><td><kbd>⌘</kbd><kbd>/</kbd></td></tr>
      <tr><td>Command Palette</td><td><kbd>⌘</kbd><kbd>K</kbd></td></tr>
      <tr><td>Print</td><td><kbd>⌘</kbd><kbd>P</kbd></td></tr>
    </tbody>
  </table>
</div>
```

- [ ] **Step 2: Append shortcut styles** (frontend-design for polish). Baseline:

```css
#shortcuts { padding-top: 64px; padding-bottom: 64px; }
.shortcuts { max-width: 560px; }
.shortcuts table { width: 100%; border-collapse: collapse; }
.shortcuts td, .shortcuts th { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); }
.shortcuts th { color: var(--muted); font-family: var(--font-text); font-weight: 500; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; }
kbd { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; background: var(--surface); border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 6px; padding: 2px 7px; margin-right: 3px; }
```

- [ ] **Step 3: Render check** — load the page. Expected: a clean two-column table; each shortcut rendered as `<kbd>` key caps.

- [ ] **Step 4: Commit**

```bash
git add docs/index.html docs/styles.css
git commit -m "feat(site): ⌨️ keyboard shortcuts table"
```

---

### Task 8: Footer

**Files:**
- Modify: `docs/index.html` (`<footer>`)
- Modify: `docs/styles.css` (append footer styles)

- [ ] **Step 1: Replace `<footer>` content**

```html
<footer>
  <div class="wrap footer">
    <p class="footer-tech">Built with
      <a href="https://tauri.app/">Tauri v2</a>,
      <a href="https://milkdown.dev/">Milkdown Crepe</a>,
      <a href="https://github.com/raphlinus/pulldown-cmark">pulldown-cmark</a>,
      <a href="https://github.com/trishume/syntect">syntect</a>,
      <a href="https://github.com/rust-ammonia/ammonia">ammonia</a>, and
      <a href="https://github.com/notify-rs/notify">notify</a>.
    </p>
    <p class="footer-links">
      <a href="https://github.com/habib-sust/groot">GitHub</a> ·
      <a href="https://github.com/habib-sust/groot/blob/main/LICENSE">MIT License</a>
    </p>
  </div>
</footer>
```

- [ ] **Step 2: Append footer styles**

```css
footer { border-top: 1px solid var(--border); padding-top: 40px; padding-bottom: 56px; margin-top: 32px; }
.footer { text-align: center; color: var(--muted); font-size: 0.92rem; }
.footer-links { margin-top: 8px; }
```

- [ ] **Step 3: Render check** — load the page. Expected: centered footer with working tech-stack links and GitHub / MIT links.

- [ ] **Step 4: Commit**

```bash
git add docs/index.html docs/styles.css
git commit -m "feat(site): 🦶 footer with credits + links"
```

---

### Task 9: Responsive & accessibility polish pass

**Files:**
- Modify: `docs/styles.css` (append responsive + a11y rules)
- Modify: `docs/index.html` (only if fixes needed)

- [ ] **Step 1: Add responsive breakpoints & reduced-motion** to `styles.css`

```css
@media (max-width: 640px) {
  body { font-size: 16px; }
  main > section, header { padding-left: 18px; padding-right: 18px; }
  .copy-field { flex-wrap: wrap; }
  #brew-cmd { font-size: 0.8rem; word-break: break-all; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
img { max-width: 100%; height: auto; }
```

- [ ] **Step 2: Accessibility audit** — verify in the rendered page:
  - Every `<img>` has meaningful `alt` text (screenshots describe what they show; decorative icon glyphs use `aria-hidden="true"`).
  - Heading order is logical: one `<h1>` (hero), `<h2>` per section, `<h3>` within.
  - `:focus-visible` outline is visible when tabbing through the Copy button, Download link, and footer links.
  - Color contrast of `--muted` text on `--bg` is acceptable in both themes (bump opacity if it reads too faint).
  - Fix any issues found inline.

- [ ] **Step 3: Responsive check** — load the page, resize the browser to ~375px wide (and toggle OS dark mode). Expected: feature grid is one column, hero command pill wraps without overflow, screenshots scale to fit, no horizontal scrollbar; both themes legible.

- [ ] **Step 4: Commit**

```bash
git add docs/index.html docs/styles.css
git commit -m "feat(site): 📱 responsive + a11y polish"
```

---

### Task 10: Enable GitHub Pages & document

**Files:**
- Modify: `README.md` (add a website link near the top)
- Modify: `docs/releasing.md` (note the Pages source, if a release/docs section fits)

- [ ] **Step 1: Push the branch and merge to `main`** (Pages "deploy from branch" serves `main`/`/docs`). Confirm `docs/index.html`, `docs/styles.css`, `docs/.nojekyll`, and `docs/assets/*` are all on `main`.

- [ ] **Step 2: Enable Pages via the GitHub CLI** (source = `main` branch, `/docs` folder)

```bash
gh api -X POST repos/habib-sust/groot/pages -f 'source[branch]=main' -f 'source[path]=/docs' 2>/dev/null \
  || gh api -X PUT repos/habib-sust/groot/pages -f 'source[branch]=main' -f 'source[path]=/docs'
```

Expected: JSON describing the Pages site (or a 409 if already enabled — then the PUT updates the source). If the CLI lacks scope, enable manually: repo **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/docs`**.

- [ ] **Step 3: Verify deployment** — wait ~1 minute, then load `https://habib-sust.github.io/groot/`. Expected: the full landing page renders, screenshots load (confirms relative paths resolve under `/groot/`), fonts load, Copy button works. Check the browser console for any 404s on assets.

- [ ] **Step 4: Add a website link to `README.md`** near the top, e.g. under the title: `**Website:** https://habib-sust.github.io/groot/`.

- [ ] **Step 5: Commit & push**

```bash
git add README.md docs/releasing.md
git commit -m "docs: 🌐 link to GitHub Pages site"
git push
```

---

## Self-Review

**Spec coverage:**
- Hosting (`/docs` on main, `.nojekyll`, relative paths, URL) → Tasks 1, 10. ✓
- Stack (static HTML/CSS, fonts, inline copy JS, inline SVG) → Tasks 1, 3. ✓
- Visual identity (theme tokens, gradient, Fraunces/Newsreader, both themes via `prefers-color-scheme`) → Tasks 1, 9. ✓
- Hero (icon, title, tagline, brew copy CTA, .dmg download, gradient wash, hero shot) → Task 3. ✓
- Feature grid (all README features + glyphs) → Task 4. ✓
- Screenshot showcase (3 shots, macOS window chrome) → Tasks 2, 5. ✓
- Install (brew, notarization note, dev/build instructions) → Task 6. ✓
- Keyboard shortcuts table → Task 7. ✓
- Footer (tech credits, repo, MIT) → Task 8. ✓
- Screenshots captured (hero/light, palette, outline/dark) → Task 2. ✓
- Responsiveness & a11y → Task 9. ✓
- Out-of-scope items respected (no analytics, no toggle, single page, default domain) → honored throughout. ✓

**Placeholder scan:** Feature glyph SVG paths are intentionally left to the implementer (noted "swap glyph paths" with a concrete source — Lucide); all content strings, links, and the structural code are concrete. No TBD/TODO. ✓

**Type/name consistency:** `#brew-cmd` + `#copy-btn` ids are defined in Task 3 markup and referenced by the Task 3 script. Asset filenames (`icon.svg`, `hero.png`, `command-palette.png`, `outline-dark.png`) created in Task 2 match references in Tasks 3 & 5. Section ids (`#hero`/`#features`/`#showcase`/`#install`/`#shortcuts`) defined in Task 1 match the modify targets in Tasks 3–7. ✓
