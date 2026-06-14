# Status Bar + Micro-Polish — Design (Phase 1 of UX Polish)

**Date:** 2026-06-14
**Status:** Approved for planning
**Phase:** 1 of 3 in the "real editor feel" UX polish theme
 (Phase 2 — typewriter + focus mode; Phase 3 — command palette + shortcuts — each gets its own spec/plan cycle later.)

## Background & rationale

Groot's editor is **Milkdown Crepe**, a ProseMirror *node-based* WYSIWYG. The
markdown source is parsed into a document tree on load, so literal syntax
markers (`**`, `#`, `>`) do not exist in the editing model. This rules out the
Obsidian/Typora "reveal markers around the cursor" effect as a low-cost feature
— it would require a custom plugin synthesizing fake marker text per node type,
fighting the framework's core design.

Instead this phase pursues **general polish and "real editor feel"** with
changes that fit Crepe rather than fighting it. The biggest felt upgrade for the
least architectural risk is a **status bar**, bundled with a **micro-polish
pass** that shares the same surface and styling work.

## Goals

- A slim, always-present **status bar** giving the document a sense of substance
  and state (word count, reading time, save state, selection-aware counts,
  section breadcrumb).
- A handful of **micro-polish** fixes that make the app feel finished:
  new-file empty state, save acknowledgement, non-destructive error display,
  consistent chrome transitions.

## Non-goals (explicitly out of scope)

- Typewriter scrolling / focus mode (Phase 2).
- Command palette / shortcut cheatsheet (Phase 3).
- Status-bar visibility **persistence** across launches (YAGNI for now; matches
  the outline, which also doesn't persist).
- `line:col` cursor position — meaningless in a node-tree WYSIWYG; deliberately
  excluded in favor of selection-aware word/char counts.

---

## Component 1 — Status bar

### Surface & layout

Frontend-only. New `<footer id="status-bar">` element in `src/index.html`,
styled in `src/styles.css`, driven by `src/main.js`.

Today the body is a flex row (`#outline | #viewport`). The status bar must sit
along the **bottom edge of the full window**, spanning the width, without
overlapping the viewport or the outline. Implementation: wrap the existing
`outline + viewport` row in a column layout so the status bar is a sibling row
beneath it (e.g. body becomes a column: `[ row: outline | viewport ] [ status-bar ]`).
The viewport's available height shrinks by the bar's height. The find-bar and
unsaved-modal overlays are unaffected (they're absolutely/fixed positioned).

Visual: thin (~24–28px), uses existing palette tokens (`--bg`, `--fg`, muted
border-top via existing token), small/secondary text size, items laid out with
the breadcrumb left-aligned and the counts/save-state right-aligned. Themed for
light and dark via the existing `:root[data-theme]` tokens — no new theme block.

### Contents (left → right)

- **Section breadcrumb** (left): the nearest enclosing heading for the current
  cursor position, prefixed with `§` (e.g. `§ Installation`). Empty string when
  the cursor is above the first heading or the doc has no headings.
- **Word count** (right group): live total words, e.g. `412 words`.
- **Reading time** (right group): `Math.ceil(words / 200)` → `3 min read`.
- **Save state** (right group): `✓ Saved` when `dirty === false`, `● Unsaved`
  when `dirty === true`. Reuses the existing `dirty` flag (single source of
  truth, already maintained by `markdownUpdated` and the save flow).
- **Selection-aware override:** when the selection is non-empty, the word count
  swaps to `N words selected` (and reading time hides) until the selection
  collapses again.

### Data source & update triggers

The live editor view is already captured as `searchView`
(`crepe.editor.ctx.get(editorViewCtx)`). Word/char counts come from
`searchView.state.doc.textContent` (plain text, no markdown markers). Selection
counts come from the text within `state.selection.from..to`.

Updates are driven by the listener plugin (already in use for `markdownUpdated`):

- `markdownUpdated` → recompute word count + reading time + save state.
- `selectionUpdated` (from `@milkdown/plugin-listener`, confirmed available) →
  recompute breadcrumb + selection-aware counts.

Both recomputations are cheap, but `markdownUpdated` fires per keystroke, so
debounce the full recompute (~150–300ms, mirroring the outline's
`outlineDebounce` pattern) to avoid thrash. Save-state and selection feedback
should feel instant, so update those immediately and debounce only the
word-count text computation if needed.

Because `render()` destroys and recreates the editor on every load, the status
bar wiring (listeners + initial compute) must be **re-attached inside
`render()`** — same constraint as find highlights and the outline. The
`#status-bar` DOM element itself persists (it lives outside `#viewport`); only
its data bindings re-attach.

### Breadcrumb computation

Reuse the heading-walk approach already in `buildOutline()`. Given the cursor's
document position, find the nearest preceding heading node and display its text.
A lightweight approach: on `selectionUpdated`, resolve the selection head and
scan backward through top-level nodes for the closest heading; or map the
cursor's DOM position to the nearest preceding `h1–h6` in `#viewport`. The
implementation plan will pick the simpler of the two that proves reliable; both
are O(headings) and inexpensive.

### Toggle

Add a **View → Toggle Status Bar** menu item, mirroring `toggle_outline`:

- `src-tauri/src/menu.rs`: build `toggle_status_bar` MenuItem in the View
  submenu; dispatch `app.emit("toggle-status-bar", ())`.
- `src/main.js`: `listen("toggle-status-bar", ...)` flips `#status-bar`'s hidden
  state (and pauses/resumes its recompute when hidden).

Default: **visible**. No persistence this phase.

---

## Component 2 — Micro-polish pass

### 2a. New-file empty state

Today `newFile()` calls `render("")`, leaving a blank void with no affordance.
Use Crepe's native **Placeholder** feature (confirmed: `CrepeFeature.Placeholder`
with config `{ text: string, mode: 'doc' | 'block' }`).

- Enable the feature in the `new Crepe({ features, featureConfigs })` block in
  `render()`.
- Config: `mode: 'doc'` with text like `"Start writing…"` (final copy TBD in
  plan). The placeholder shows only while the document is empty and disappears
  on first keystroke — native behavior.
- Applies to all empty documents, not just new files (consistent).

### 2b. Save acknowledgement

`save()` currently clears `dirty` and updates the title silently. Add a
`showToast("Saved")` on successful write (both `save()` and after a successful
`saveAs()` write). Reuses the existing transient toast. Does **not** fire on
no-op or cancelled save-as.

### 2c. Non-destructive error display

**Latent bug being fixed here:** `showError(message)` currently does
`viewport.innerHTML = '<p class="error">…</p>'`, which **destroys the live Crepe
editor and any unsaved content** whenever any handler hits an error (e.g. a save
failure, a parse error during export). Convert error reporting to a
**dismissible banner/toast** that overlays without replacing the viewport, so an
error never nukes the document.

- Replace the `innerHTML`-wipe implementation of `showError` with a banner
  element (new element in `index.html`, or reuse/extend the toast with an
  "error" variant that persists until dismissed).
- The initial-load failure path (no editor yet, e.g. open-error before any
  render) may still show inline content since there's nothing to destroy; the
  plan will confirm both paths. The key invariant: **never wipe a live editor.**

### 2d. Chrome transition polish

Apply consistent, subtle enter/leave transitions to the find-bar, outline,
unsaved-modal, and the new status bar so chrome feels intentional. CSS-only
(opacity/transform transitions); no JS timing logic beyond toggling the
existing `hidden`/class states. Respect `prefers-reduced-motion`.

---

## Affected files (summary)

| File | Change |
|------|--------|
| `src/index.html` | Add `#status-bar` footer; restructure body to column layout; add error-banner element if not reusing toast. |
| `src/styles.css` | Status-bar styles (themed via existing tokens); layout restructure; transition polish; `prefers-reduced-motion`. |
| `src/main.js` | Status-bar compute + listeners (re-attached in `render()`); `selectionUpdated` wiring; breadcrumb; toggle listener; enable Placeholder feature; `showToast("Saved")`; rewrite `showError` to be non-destructive. |
| `src-tauri/src/menu.rs` | `toggle_status_bar` View menu item + `emit("toggle-status-bar")`. |

No new Rust commands; no new permissions; no persistence layer.

## Testing & verification

- **Frontend build** (`npm run build`) — authoritative syntax/bundle check.
- **Rust check** (`~/.cargo/bin/cargo check --manifest-path src-tauri/Cargo.toml`)
  — recompiles capabilities after the menu change.
- **Manual (dev run):** word count updates while typing; selection shows
  "N words selected"; reading time matches; save state flips on edit/save;
  breadcrumb tracks the cursor's section; toggle hides/shows the bar; new file
  shows the placeholder; ⌘S shows "Saved"; an induced error (e.g. save to an
  unwritable path) shows a banner **without** destroying the editor; transitions
  are smooth and disabled under reduced-motion.

## Risks & mitigations

- **`selectionUpdated` frequency / breadcrumb cost.** Mitigate with the
  outline-style debounce and O(headings) computation.
- **Layout regression** from restructuring the body to a column. Mitigate by
  verifying outline + viewport + find-bar overlay still position correctly in
  both themes.
- **Re-attach on `render()`.** Forgetting to re-wire after editor recreation is
  the classic Groot pitfall (same as find/outline); the plan must include it as
  an explicit step.
