# WYSIWYG Editor — Slice D: Reintegrate find / outline / copy / export / print + theme polish — Design

**Date:** 2026-06-05
**Status:** Approved
**Project:** `groot` — Markdown viewer → editor (Tauri v2 + Rust, Vite, Milkdown Crepe).
**Part of:** the WYSIWYG-editing epic. This is the **final slice**; completing it makes
`feat/wysiwyg-editor` coherent and it **merges to `main`** after this slice.

## Editing epic (context)
- A. Vite migration — **done, merged.**
- B. Crepe as the always-editable document surface — **done.**
- C. Save / dirty-tracking / New / close-guard / live-reload reconcile — **done.**
- **D. Reintegrate find / outline / copy / export / print + theme polish** — this slice.

## Goal (Slice D)
Restore the viewer-era features around the Crepe editor and unify theming, so the
WYSIWYG branch regains everything the read-only viewer had and is ready to merge.
These features were parked in Slice B because they targeted the old
`parse_markdown → innerHTML` DOM, which Crepe now owns.

## Key principle: no new Rust commands
Slice D is **frontend-only**. It reuses the Rust commands kept in Slice B for exactly
this purpose:
- `parse_markdown(markdown) -> sanitized HTML string` (pulldown-cmark + ammonia),
- `syntax_css(theme) -> String` (syntect CSS, no media wrapper),
- `export_html(body, css, name)` (save dialog + write standalone HTML).

The implementer verifies these signatures against the current Rust source before
wiring; if a signature differs, adjust the JS call (not the Rust).

## Decisions (from brainstorming)
- **Export/Print** render from `crepe.getMarkdown()` → `parse_markdown` → clean HTML
  (not by cloning the editable DOM).
- **Find** keeps the CSS Highlight overlay, find-only, re-run on input + on reload.
- **Outline** rebuilds on load **and** ~300ms debounced after edits.
- **Copy-code** uses Crepe's built-in code-block Copy button; our injector is deleted.
- **Theme** is a full `--crepe-color-*` bridge in both light and dark.

## Architecture / components

### 1. Copy-code — remove ours, use Crepe's
- Crepe's `CodeMirror` code-block feature renders its **own** Copy button (+ language
  picker), configurable via `copyText`/`copyIcon`/`onCopy`; it is themed by the
  `--crepe-color-*` variables set in the theme bridge (§6).
- **Delete** the `addCopyButtons()` function and any remaining call to it (it injected
  a `<button class="copy-btn">` into `<pre>` elements that Crepe no longer emits, and
  injecting children into ProseMirror-managed nodes is fragile).
- **Remove** the now-dead `.copy-btn` CSS rules from `styles.css`.
- Exported/printed HTML re-renders from markdown (§4, §5), so code blocks become clean
  `<pre><code>` with no buttons — nothing to strip.

### 2. Find (⌘F) — overlay, re-wired
- Keep the existing overlay implementation: `openFind` / `closeFind` / `runSearch` /
  `setCurrent` / `goTo`, using `document.createTreeWalker(viewport, SHOW_TEXT)` to
  collect `Range`s and the CSS Custom Highlight API (`CSS.highlights` +
  `new Highlight(...)`) to paint `find-all` / `find-current`. Next/prev scroll the
  current range into view.
- **Re-wire:** in `render()` (which destroys/recreates Crepe), call
  `clearFindHighlights()`; then, if the find bar is open (`!findBar.hidden`), re-run
  `runSearch(findInput.value)` after Crepe is created so highlights reflect the newly
  loaded document.
- The TreeWalker sees Crepe's rendered text nodes (headings, paragraphs, list items,
  and visible CodeMirror code text), so highlighting works without knowing Crepe
  internals.
- **Accepted limitation:** highlights can briefly go stale while typing (ProseMirror
  re-renders text nodes mid-edit); retyping/re-running the query refreshes them. Find
  is read-only highlighting — no Replace.

### 3. Outline (⌘⇧O) — live
- Keep `buildOutline()` (queries `#viewport` for `h1`–`h6`, which Crepe renders as real
  heading elements; builds `.outline-link`s; wires an `IntersectionObserver` for
  scroll-spy; clicking a link scrolls its heading into view) and `toggleOutline()`.
- **Re-wire — rebuild triggers:**
  - After each `render()` (document load/reload), call `buildOutline()`.
  - Add a **~300ms debounced** `buildOutline()` call onto Crepe's existing
    `markdownUpdated` listener (the same listener that sets `dirty`/`updateTitle`), so
    the outline tracks heading edits without rebuilding on every keystroke.
- **Scroll root:** `buildOutline()`'s `IntersectionObserver` must observe relative to
  the element that actually scrolls. Today `#viewport` is the scroll container
  (`overflow:auto`, with `#viewport .milkdown { height:100% }`). The implementer
  **verifies in the running app** that headings trigger the observer; if Crepe
  introduces its own inner scroller, set the observer's `root` to that element.
- Clicking an outline link **scrolls** the heading into view (no need to move the
  editor cursor).

### 4. Export HTML — re-render from markdown
- Rewrite `exportHtml()`:
  1. guard: if `!crepe`, return.
  2. `const { bodyHtml, codeCss } = await renderCleanHtml();` (helper below; it reads
     the markdown from Crepe internally).
  3. `const body = '<div class="markdown-body">' + bodyHtml + '</div>';`
  4. `const css = stylesText + "\n" + codeCss;` (`stylesText` is the already-imported
     `./styles.css?raw`).
  5. derive `name` from `currentPath` (basename with `.md`/`.markdown` → `.html`), else
     `"untitled.html"`.
  6. `await invoke("export_html", { body, css, name });`
- Exported file is a clean **light** standalone document: no `data-theme` attribute on
  `:root` (so `styles.css` renders its light defaults), no editor chrome, code
  highlighted by syntect's **light** CSS.
- On error → `showError`, abort.

### 5. Print / PDF — print a clean render, not the editor
- `window.print()` currently prints the whole webview (Crepe toolbars, cursor,
  contenteditable styling). Replace with a clean-render print path:
  1. `const { bodyHtml, codeCss } = await renderCleanHtml();`
  2. Create a hidden container dynamically:
     `const c = document.createElement("div"); c.id = "print-container";
      c.className = "markdown-body"; c.innerHTML = bodyHtml;
      document.body.appendChild(c);`
  3. Inject a print-scoped syntect style:
     `const s = document.createElement("style"); s.id = "syntax-print";
      s.textContent = "@media print {\n" + codeCss + "\n}";
      document.head.appendChild(s);`
  4. `window.print();`
  5. Clean up afterward: remove `#print-container` and `#syntax-print` (use a
     `setTimeout(..., 0)` after `print()` so removal doesn't race the print dialog; or
     a one-shot `afterprint` listener — implementer's choice, but cleanup must happen).
- Print CSS in `styles.css` (see §6 / Files): an `@media print` block that **hides**
  `#viewport`, `#outline`, `#find-bar`, `#unsaved-modal`, and any Crepe toolbar/menu
  chrome, and **shows** `#print-container` (`display:block`) styled as a clean
  document. Reuse the existing viewer print rules where applicable (the print selector
  must cover light only — exported/printed docs are light: e.g. `:root, :root[data-theme="dark"]`
  reset to light inside `@media print`, consistent with the existing export
  print-in-dark fix).

### renderCleanHtml() helper (DRY, shared by Export + Print)
```js
async function renderCleanHtml() {
  const md = crepe ? crepe.getMarkdown() : currentSource;
  const bodyHtml = await invoke("parse_markdown", { markdown: md });
  const codeCss = await invoke("syntax_css", { theme: "light" });
  return { bodyHtml, codeCss };
}
```
- Both Export and Print call this. Light theme is intentional (clean printed/exported
  document). On invoke failure the caller catches and `showError`s.

### 6. Theme — full bridge, both modes
- **Dark** already has a `:root[data-theme="dark"] .milkdown { --crepe-color-*: … }`
  block (slate palette). Extend it to cover any still-default-looking surfaces
  (code-block background, table borders, blockquote, links/primary) so nothing reads
  white.
- **Light** currently uses Crepe defaults (near-white), which clash with the app's
  warm-cream chrome. Add a light bridge — either base `#viewport .milkdown { … }` or an
  explicit `:root[data-theme="light"] .milkdown { … }` (match whatever attribute
  `applyTheme` sets) — mapping the full `--crepe-color-*` set to the warm-cream palette.
- **Source values from the app's existing palette tokens** already defined in
  `styles.css` `:root` (warm cream light) and `:root[data-theme="dark"]` (slate). Map,
  at minimum: `--crepe-color-background`, `-surface`, `-surface-low`, `-on-background`,
  `-on-surface`, `-on-surface-variant`, `-outline` (borders → dusty-pink),
  `-primary`/`-inline-code` (accent → warm-yellow / dusty-pink), `-inline-area`,
  `-secondary`/`-on-secondary`, `-hover`, `-selected` (→ sage tint), `-error`. The exact
  Crepe variable list comes from `grep -rohE "\-\-crepe[a-z0-9-]*" node_modules/@milkdown/crepe/lib/theme`.
- Crepe's built-in copy button + toolbar inherit these variables, so §1 needs no extra
  styling.

## Data flow
- **Open / reload:** `render(md)` → destroy+recreate Crepe → after `create()`:
  register `markdownUpdated` (→ `dirty=true; updateTitle(); debouncedBuildOutline()`),
  set `dirty=false`, then `buildOutline()`, then `clearFindHighlights()` + re-run find
  if the bar is open.
- **⌘F:** `openFind()` → `runSearch()` (TreeWalker over `#viewport`).
- **⌘⇧O:** `toggleOutline()`.
- **Export:** `exportHtml()` → `renderCleanHtml()` → `export_html`.
- **Print:** `print` → `renderCleanHtml()` → hidden `#print-container` + print CSS →
  `window.print()` → cleanup.

## Error / Edge Handling
- `crepe` null (not yet mounted) → Export/Print/Find/Outline guard and no-op.
- `parse_markdown` / `syntax_css` / `export_html` failure → `showError`, abort that
  action; the editor is unaffected.
- Empty document → outline shows "No headings in this document."; find shows `0/0`.
- Print cleanup always runs (no leftover `#print-container`/`#syntax-print` in the DOM).

## Files
- **Modify `src/main.js`:** rewrite `exportHtml()`; add `renderCleanHtml()` helper and
  the clean-render print path (replacing `window.print()` and the old
  `injectPrintSyntax`); re-wire find re-run + live debounced outline into `render()` /
  `markdownUpdated`; **delete** `addCopyButtons()` and its call.
- **Modify `src/styles.css`:** full light + dark `--crepe-color-*` bridge; `@media print`
  clean-document rules (hide chrome, show `#print-container`, force light); **remove**
  dead `.copy-btn` rules.
- **`src/index.html`:** no change (print container created in JS).
- **Rust:** none (verify `parse_markdown` / `syntax_css` / `export_html` signatures).

## Testing
- **Headless:** `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml` green
  (Rust unchanged, 24 tests); `npm run build` clean (CSS braces balanced, ESM resolves).
- **GUI** (`npm run tauri dev`):
  - **Find:** ⌘F highlights matches, count shows `n/m`, next/prev scrolls and updates
    current; closing clears highlights; opening a new doc re-runs find if bar open.
  - **Outline:** ⌘⇧O lists headings; adding/editing a heading updates the list within
    ~300ms; scroll-spy highlights the active heading; clicking scrolls to it.
  - **Copy-code:** a fenced code block shows Crepe's Copy button; clicking copies the
    code.
  - **Export:** Export-as-HTML writes a file that opens as a clean, syntax-highlighted
    document with **no** editor chrome (no toolbar/cursor/copy button).
  - **Print:** Print preview shows a clean document (no toolbars/cursor/sidebars); the
    DOM has no leftover `#print-container` afterward.
  - **Theme:** light mode is warm cream (not white) and dark mode is slate (not white),
    both cohesive with the app chrome, accents on-palette.

## Acceptance Criteria
- Find, outline, copy-code, export, and print all work against the Crepe surface.
- The editor surface is themed cohesively in both light and dark, matching the app
  chrome palette.
- No new Rust commands; `parse_markdown` / `syntax_css` / `export_html` reused.
- `cargo test` passes (24); `npm run build` succeeds.
- The `feat/wysiwyg-editor` branch is coherent (no regressions vs the old viewer's
  feature set) and ready to merge to `main`.
