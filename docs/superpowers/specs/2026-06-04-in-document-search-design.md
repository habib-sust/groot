# In-Document Search (⌘F) — Design

**Date:** 2026-06-04
**Status:** Approved
**Project:** `groot` — lightweight Markdown viewer (Tauri v2 + Rust).
**Builds on:** the merged viewer on `main` (highlighting, native menu, themes).

## Goal

Add a minimal in-document find bar: ⌘F opens a search box that highlights all
case-insensitive substring matches in the rendered document, shows a match count,
and navigates between matches.

## Scope

### In scope
- A native **Edit → Find…** menu item (⌘F) that emits a `find` event.
- A find-bar overlay in the webview (input, match count, prev/next, close).
- Incremental case-insensitive substring search over the rendered document,
  highlighting matches via the CSS Custom Highlight API.
- Next/Prev navigation (Enter / Shift+Enter, wrapping) that scrolls the current
  match into view and emphasizes it; Esc closes and clears.

### Out of scope (deferred)
- Case-sensitive / whole-word / regex toggles.
- Matches spanning across inline-formatting boundaries (multi-text-node).
- Find-and-replace (the app is a read-only viewer).

## Architecture

### Trigger (Rust — `menu.rs`)
- Add a **Find…** item (id `find`, accelerator `CmdOrCtrl+F`) to the existing Edit
  submenu (next to Copy / Select All).
- In `handle_menu_event`, add an arm: `"find" => { let _ = app.emit("find", ()); }`
  (emit a unit payload; the frontend just needs the signal).

### Find bar (frontend)
- `src/index.html`: a `<div id="find-bar" hidden>` containing a text `<input
  id="find-input">`, a `<span id="find-count">`, previous/next `<button>`s, and a
  close `<button>`. Positioned `fixed` at the top-right, themed via CSS variables.
- `src/main.js`: on the `find` event, unhide the bar and focus+select the input.

### Search (frontend — CSS Custom Highlight API)
- `runSearch(query)`:
  - Clear previous highlights. If `query` is empty, set count to empty and return.
  - Walk `#viewport` with `document.createTreeWalker(viewport, NodeFilter.SHOW_TEXT)`.
    For each text node, lowercase-scan for every occurrence of the lowercased query
    and build a `Range` (`setStart`/`setEnd` on that node) per match.
  - Collect ranges into a `matches` array. Register `new Highlight(...matches)` as
    `CSS.highlights.set("find-all", …)`. Reset current index to 0.
  - Update `#find-count` to `"<current+1>/<total>"` (or `"0/0"` when none; flag the
    input visually on zero).
  - Call `setCurrent(0)`.
- `setCurrent(i)`: clamp/wrap `i`; put `matches[i]` into a separate
  `CSS.highlights.set("find-current", new Highlight(range))`; scroll its
  `startContainer.parentElement` into view with `{ block: "center" }`; update count.
- `goTo(delta)`: `setCurrent((current + delta + total) % total)` when `total > 0`.
- Guard the whole feature behind `if (CSS.highlights)`; if absent, the bar still
  opens but search no-ops (no error).

### Interaction
- Input `input` event → `runSearch(value)` (incremental).
- Input `keydown`: Enter → `goTo(+1)`; Shift+Enter → `goTo(-1)`; Escape →
  `closeFind()`.
- Prev/Next buttons → `goTo(-1)` / `goTo(+1)`. Close button → `closeFind()`.
- `closeFind()`: hide the bar, clear both highlights (`CSS.highlights.delete(...)`),
  clear the input and count.
- **Clear on render:** `render()` calls `closeFind()` (or clears highlights) so a
  newly opened document doesn't carry stale ranges/highlights.

### Styling (`src/styles.css`)
- `#find-bar`: fixed top-right card (bg `var(--bg)`, border `var(--border)`,
  shadow), flex row; input, count (muted), small buttons matching the app.
- `::highlight(find-all)`: subtle highlight background (a warm/amber-tinted wash
  that reads on both light and dark — e.g. semi-transparent amber).
- `::highlight(find-current)`: stronger background for the active match.
- A `.no-match` class on the input (e.g. red-ish border) when count is 0.

## Data Flow
⌘F (native Edit→Find) → Rust emits `find` → JS unhides + focuses the bar → user
types → `runSearch` highlights all + sets current + count → Enter/Shift+Enter or
buttons navigate (`setCurrent` scrolls + emphasizes) → Esc/✕ closes and clears.
Opening a new document clears the find state.

## Error / Edge Handling
- Empty query → highlights cleared, count blank.
- No matches → `0/0`, input flagged `.no-match`.
- Cross-node matches not found (single-text-node matching) — acceptable; noted.
- `CSS.highlights` unavailable → feature no-ops behind a guard, no crash.
- Stale ranges after re-render → cleared by `closeFind()` in `render()`.

## Files
- `src-tauri/src/menu.rs` — Find… item + `"find"` emit arm.
- `src/index.html` — find-bar markup.
- `src/main.js` — find module + `listen("find")` + clear-on-render.
- `src/styles.css` — find-bar + `::highlight(...)` rules.

## Testing
No new Rust-testable core (the menu item only emits an event), and the search
logic is webview JS with no JS test runner in this project — so there is **no new
automated-test surface**. The existing Rust build + 21 unit tests stay green;
`node --check src/main.js` passes. The search behavior is verified in the GUI
smoke test:
- ⌘F opens the bar; typing highlights matches and shows a correct count.
- Enter/Shift+Enter cycle through matches (wrapping), scrolling each into view.
- Esc closes and clears highlights; opening another document resets the bar.
- A no-match query shows `0/0` and flags the input.

## Acceptance Criteria
- ⌘F (or Edit → Find…) opens a find bar focused for typing.
- Typing highlights all case-insensitive matches and shows `current/total`.
- Enter / Shift+Enter (and the buttons) move between matches, wrapping, scrolling
  the active match into view and emphasizing it.
- Esc / close clears highlights and hides the bar; opening a new document resets it.
- `cargo test` still passes (21); the Rust builds clean.
