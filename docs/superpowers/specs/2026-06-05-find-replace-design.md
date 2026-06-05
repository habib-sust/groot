# Find & Replace — Editor-Integrated Search via prosemirror-search — Design

**Date:** 2026-06-05
**Status:** Approved
**Project:** `groot` — Markdown editor (Tauri v2 + Rust, Vite, Milkdown Crepe).

## Goal
Replace groot's read-only find overlay with editor-grade Find **and Replace**, backed by
`prosemirror-search`, so highlights track edits live and replacements go through the
editor's transaction/undo history.

## Context
Today find is a read-only overlay: `runSearch()` walks `#viewport` text nodes with a
`TreeWalker` and paints matches via the CSS Custom Highlight API
(`clearFindHighlights` / `runSearch` / `setCurrent` / `goTo`, gated by
`highlightsSupported`). It cannot replace, and (a known Slice D limitation) highlights
go stale while typing, so `render()` clears + re-runs them on reload. Crepe exposes the
underlying Milkdown `Editor` via `crepe.editor` and accepts plugins via
`crepe.editor.use(...)`, so a real ProseMirror search plugin can be integrated.
`prosemirror-search` is **not yet installed**.

## Decision
Use **`prosemirror-search`** integrated as a Milkdown `$prose` plugin. One search system
handles both find and replace; matches are document decorations (track edits live),
replacements are transactions (undo/redo works). This **removes** the CSS-highlight
overlay entirely.

## Implementation

### Dependency
- `npm install prosemirror-search`. Ensure its `prosemirror-state`/`-view`/`-model` peers
  resolve to the same versions Milkdown uses (dedupe if the build pulls duplicates).

### Plugin wiring (`src/main.js`)
- Import `$prose` from `@milkdown/kit/utils` (Milkdown's raw-ProseMirror-plugin wrapper)
  and `search`, `setSearchState`, `findNext`, `findPrev`, `replaceNext`, `replaceAll`,
  `SearchQuery` from `prosemirror-search`. Import `editorViewCtx` from
  `@milkdown/kit/core` to reach the `EditorView`. (Exact import paths are
  version-sensitive — the implementer verifies against the installed packages and
  adjusts; `@milkdown/kit` re-exports the prosemirror/core/utils pieces Crepe uses.)
- In `render()`, before `await crepe.create()`:
  `crepe.editor.use($prose(() => search()))`.
- After `create()`, capture the view for command dispatch:
  `view = crepe.editor.ctx.get(editorViewCtx)` (store in a module-level `let view`).
  Because the editor is recreated on each document load, the plugin re-registers and the
  view is recaptured fresh — no stale search state.

### Search/replace operations (`src/main.js`)
Replace the overlay functions with thin wrappers over `prosemirror-search`:
- `runSearch(query)`: build `new SearchQuery({ search: query, caseSensitive: false })`
  and dispatch `setSearchState(view.state.tr, sq)` via `view.dispatch`; update the count
  (below). Empty query → set an empty `SearchQuery` to clear highlights.
- `goTo(+1/-1)`: `findNext(view.state, view.dispatch)` / `findPrev(...)` (they move the
  selection to the next/previous match and scroll it into view).
- `replaceOne()`: `replaceNext(view.state, view.dispatch)` using the current replace-input
  value (set on the `SearchQuery`'s `replace` field when building it), then refresh count.
- `replaceAll()`: `replaceAll(view.state, view.dispatch)`, then refresh count.
- `closeFind()`: clear the search state (empty query) and hide the bar; return focus to
  the editor.
- **Match count `n/m`:** if `prosemirror-search` exposes the match set / active index
  cleanly, use it; otherwise compute by iterating matches with the `SearchQuery` over
  the doc. (The implementer verifies the available API; if no clean count is available,
  show find/active state without the `n/m` counter rather than over-engineering.)

`SearchQuery` carries both `search` and `replace`, so rebuild it whenever either input
changes and re-dispatch `setSearchState`.

### UI (`src/index.html` + `src/styles.css`)
- Extend `#find-bar` into two rows:
  - Find row (existing): `#find-input`, `#find-count`, `#find-prev` (↑), `#find-next` (↓),
    `#find-close` (✕).
  - Replace row (new): `#replace-input`, `#replace-one` (Replace), `#replace-all`
    (Replace All).
- ⌘F opens the bar and focuses `#find-input`; Esc closes + clears; Enter / Shift-Enter in
  the find input = next / prev; Enter in the replace input = Replace (current).
- Highlight theming: style `prosemirror-search`'s decoration classes
  (`.ProseMirror-search-match` and its active-match variant — exact class names verified
  against the installed version) to the app's existing find colors (the all-match and
  current-match colors the CSS-highlight overlay used), in both light and dark.

### Removals
- Delete the overlay implementation: the `TreeWalker`/`CSS.highlights` body of
  `runSearch`, `clearFindHighlights`, `setCurrent`, the `highlightsSupported` constant,
  and the `find-all` / `find-current` `::highlight()` CSS. The Slice D "clear + re-run
  find on reload" lines in `render()` are replaced (not just removed): after recapturing
  the view they re-apply the current query if the bar is open (decorations then track
  live edits, so no per-edit re-run is needed — only this once-per-reload re-apply). Keep
  the `#find-bar` element and the open/close/keyboard wiring, repointed at the new
  operations.

## Error / Edge Handling
- `view` not ready / `crepe` null → search/replace operations no-op (guard on `view`).
- Empty find query → clear highlights, no count, Replace/Replace All no-op.
- No matches → count `0/0` (or no counter if count API unavailable); Replace/Replace All
  do nothing.
- Replace operates on the current match then advances; Replace All is a single
  transaction (one undo step).
- Document reload (open/new) recreates the editor → search state resets; if the bar is
  open, re-apply the current query to the new document.

## Files
- `package.json` (+ lock) — add `prosemirror-search`.
- `src/main.js` — plugin wiring, view capture, search/replace wrappers, remove overlay.
- `src/index.html` — replace-row markup in `#find-bar`.
- `src/styles.css` — replace-row styling; theme search decoration classes; remove the old
  `::highlight()` find rules.
- Rust — none.

## Testing
- Rust unchanged → `cargo test` green (24). `npm run build` clean (new dep bundles; ESM
  imports resolve — authoritative syntax check).
- GUI: ⌘F → type a term → matches highlight, count shows, ↑/↓ navigate + scroll, current
  match distinct; **edit the document with the bar open → highlights stay correct** (no
  stale overlay); type in Replace + click Replace → current match replaced and selection
  advances; Replace All → all occurrences replaced in one undo step; ⌘Z reverts a
  replace; Esc clears highlights + closes; legible in light and dark.

## Acceptance Criteria
- Find highlights all matches and navigates next/prev; highlights track live edits.
- Replace replaces the current match; Replace All replaces every match in one undo step;
  undo reverts replacements.
- The CSS-highlight overlay and the Slice D reload re-run hack are removed; one search
  system remains.
- `cargo test` passes (24); `npm run build` succeeds.
