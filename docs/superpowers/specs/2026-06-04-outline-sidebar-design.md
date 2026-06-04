# Outline / Table-of-Contents Sidebar — Design

**Date:** 2026-06-04
**Status:** Approved
**Project:** `groot` — lightweight Markdown viewer (Tauri v2 + Rust).
**Builds on:** the merged viewer on `main`.

## Goal

A toggleable left sidebar that lists the current document's headings (indented by
level), lets you click to jump to a section, and highlights the section you're
currently scrolled to (scroll-spy).

## Scope

### In scope
- A **View → Toggle Outline** menu item (⌘⇧O) emitting a `toggle-outline` event.
- A left sidebar (`#outline`), hidden by default, listing `h1–h6` headings indented
  by level; clicking scrolls to the heading.
- Scroll-spy: highlight the outline entry for the heading currently at the top of
  the viewport, via `IntersectionObserver`.
- Rebuild the outline (and observer) on every render; empty-doc message.

### Out of scope (deferred)
- Persisting the toggle across launches (session-only; defaults hidden).
- Collapsible/foldable sections, resizable sidebar, section numbering.

## Architecture

### Toggle (Rust — `menu.rs`)
- Add a **Toggle Outline** item (id `toggle_outline`, accelerator `CmdOrCtrl+Shift+O`)
  to the existing View submenu (alongside Appearance).
- `handle_menu_event` arm: `"toggle_outline" => { let _ = app.emit("toggle-outline", ()); }`.

### Layout (`index.html` + `styles.css`)
- `index.html`: add `<nav id="outline" hidden></nav>` as the left sibling of
  `<main id="viewport">` inside `<body>`.
- `styles.css`:
  - `body { display: flex; }` (row).
  - `#outline { flex: none; width: 240px; height: 100vh; overflow: auto; border-right: 1px solid var(--border); padding: 24px 12px; }` themed via the existing variables.
  - `#outline[hidden] { display: none; }` (so the viewport spans full width when hidden — current behavior).
  - `#viewport { flex: 1; height: 100vh; overflow: auto; }` — it becomes its own scroll container; content stays centered via the existing `max-width: 860px; margin: 0 auto`.
  - Outline entries: `.outline-link` (block, padded, muted color, hover → fg);
    indentation by level via a `data-level`/padding-left scale; `.outline-link.active`
    uses the accent/link color + a left accent bar.
  - `.outline-empty` muted message.
- The fixed find-bar and absolutely-positioned copy buttons are unaffected by the
  flex layout.

### Build + scroll-spy (`main.js`)
- `slugify(text)`: lowercase, trim, replace non-alphanumerics with `-`, collapse
  dashes; dedupe with a numeric suffix when a slug repeats in the document.
- `buildOutline()` (called at the end of `render()` after `addCopyButtons()`):
  - Disconnect any previous `IntersectionObserver`.
  - Query `#viewport h1, h2, h3, h4, h5, h6` in document order. If none → set
    `#outline` content to `<p class="outline-empty">No headings in this document.</p>`
    and return.
  - For each heading: ensure it has an `id` (assign `slugify`'d id if missing);
    create an `<a class="outline-link" data-level="<n>">` with the heading text,
    a click handler → `heading.scrollIntoView({ block: "start" })`, and append to
    `#outline`.
  - Create an `IntersectionObserver` (root = `#viewport`, `rootMargin: "0px 0px -70% 0px"`,
    threshold 0) observing every heading; on changes, compute the last heading whose
    top is at/above the viewport top (the current section) and toggle `.active` on the
    matching link (clearing others). Keep the active link scrolled into view within
    the sidebar.
- `toggleOutline()`: flip `#outline.hidden`.
- `listen("toggle-outline", toggleOutline)`.
- On `render()`, the outline is rebuilt; its visibility (hidden/shown) is preserved
  across renders (toggling controls it; rebuild only refreshes contents).

### Data flow
⌘⇧O / View→Toggle Outline → Rust emits `toggle-outline` → JS flips `#outline`
visibility. Every `render()` → `buildOutline()` regenerates entries + the scroll-spy
observer for the new document. Scrolling the viewport updates the `.active` entry.

## Error / Edge Handling
- No headings → "No headings in this document." message; toggle still works.
- Re-render / open new doc → outline + observer rebuilt; previous observer
  disconnected (no leaks/stale entries).
- Duplicate heading text → ids deduped with a numeric suffix.
- Toggling while empty → shows the empty message.

## Files
- `src-tauri/src/menu.rs` — View → Toggle Outline item + `"toggle_outline"` emit.
- `src/index.html` — `<nav id="outline" hidden>`.
- `src/main.js` — `buildOutline`, `toggleOutline`, slugify, observer; `listen`.
- `src/styles.css` — flex layout, `#outline` styling, `.active`, empty state.

## Testing
No new Rust-testable core (the menu item only emits an event) and the logic is
webview JS with no JS test runner — so **no new automated-test surface**. Rust build
+ 21 unit tests stay green; `node --check src/main.js` passes. GUI smoke test:
- View → Toggle Outline (⌘⇧O) shows/hides the sidebar.
- Headings are listed in order, indented by level.
- Clicking an entry scrolls to that heading.
- Scrolling highlights the active section's entry.
- A doc with no headings shows the empty message.
- Works in both light and dark themes; find-bar and copy buttons still work.

## Acceptance Criteria
- ⌘⇧O (or View → Toggle Outline) toggles a left sidebar; hidden by default.
- The sidebar lists the document's headings indented by level; clicking jumps to one.
- The entry for the current section highlights as you scroll.
- Opening another document refreshes the outline; no-heading docs show a message.
- `cargo test` still passes (21); the Rust builds clean.
