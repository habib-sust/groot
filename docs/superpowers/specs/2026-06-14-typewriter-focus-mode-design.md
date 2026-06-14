# Typewriter + Focus Mode — Design (Phase 2 of UX Polish)

**Date:** 2026-06-14
**Status:** Approved for planning
**Phase:** 2 of 3 in the "real editor feel" UX polish theme
 (Phase 1 — status bar + micro-polish, shipped. Phase 3 — command palette + shortcuts, later.)

## Background & rationale

Groot's editor is Milkdown Crepe (ProseMirror, node-tree WYSIWYG). Phase 1 added
informational chrome (status bar) and micro-polish. Phase 2 adds the
**immersive-writing** layer that distinguishes loved editors (iA Writer, Typora,
Ulysses): **typewriter scrolling** and **focus mode**. Both are pure frontend,
hooking the listener events the status bar already uses, and re-attached inside
`render()` (the standard Groot constraint).

## Goals

- **Focus Mode:** dim everything except the block the cursor is in, so the
  current paragraph stands out — gentle dim (active block opacity 1, the rest
  ~0.35).
- **Typewriter Scrolling:** keep the caret pinned at ~40% of the viewport height
  (upper third) as the user types and moves the cursor, instead of letting it
  drift to the bottom edge.
- Two **independent** View-menu toggles; either can run alone.

## Decisions (from brainstorming)

- Focus scope: **active top-level block**, **gentle** dim (~0.35 opacity).
- Typewriter caret rest position: **upper third (~40%)**.
- Persistence: **none** — session-only, default off each launch (matches
  outline + status bar; zero backend work).
- Toggle firing for typewriter: on **every caret move** (typing + selection
  change + click), the conventional "typewriter mode" behavior. "Only while
  typing" is an explicitly-deferred future tweak, not in scope.

## Non-goals

- Sentence-level focus (iA Writer style) — fragile in a node tree; out of scope.
- Persisting toggle state across launches.
- Animated/smooth typewriter scroll (smooth-scroll lags during fast typing; use
  instant `scrollTop` adjustment).
- Menu checkmarks reflecting toggle state (Phase 1 toggles are plain items too;
  stay consistent).

---

## Component 1 — Focus Mode

### Mechanism

Frontend-only. Driven by a body class `focus-mode` (toggled by the menu) plus a
per-selection update that marks the active block.

On each selection change, resolve the cursor's **top-level block** and tag its
DOM element with class `focus-active`:

```js
let focusActiveEl = null;
function updateFocus() {
  if (!document.body.classList.contains("focus-mode") || !searchView) {
    return;
  }
  const view = searchView;
  let el = null;
  try {
    const pos = view.state.selection.$from.before(1); // start of depth-1 block
    el = view.nodeDOM(pos);
  } catch {
    el = null; // selection at a doc edge / depth 0
  }
  if (el && el.nodeType !== 1) el = el.parentElement; // ensure an Element
  if (focusActiveEl && focusActiveEl !== el) {
    focusActiveEl.classList.remove("focus-active");
  }
  if (el) el.classList.add("focus-active");
  focusActiveEl = el;
}
```

`selection.$from.before(1)` is the position immediately before the depth-1
(top-level) ancestor of the cursor; `view.nodeDOM(pos)` returns that block's DOM
element, which is a direct child of `.ProseMirror`. For nested selections (list
items, blockquotes) this still resolves to the enclosing top-level block, which
is the desired granularity.

### Styling

Only active when `body.focus-mode`:

```css
body.focus-mode #viewport .ProseMirror > * {
  opacity: 0.35;
  transition: opacity 0.2s ease;
}
body.focus-mode #viewport .ProseMirror > *.focus-active {
  opacity: 1;
}
```

The active rule carries an extra class → higher specificity than the dim rule,
so it wins. The 0.2s transition is automatically neutralized under
`prefers-reduced-motion` by the Phase 1 global rule.

### Lifecycle

- **Toggle on:** add `focus-mode` body class, call `updateFocus()` immediately.
- **Toggle off:** remove the body class; remove `focus-active` from
  `focusActiveEl` and set it to `null`.
- **On `render()`:** the editor is destroyed/recreated, so `focusActiveEl` holds
  a dead node. Reset `focusActiveEl = null` during render; `updateFocus()` runs
  again on the next selection/initial paint and re-marks the live block.

---

## Component 2 — Typewriter Scrolling

### Mechanism

Body class `typewriter` (toggled by the menu). On caret move/typing, scroll the
viewport so the caret's vertical position lands at ~40% of viewport height:

```js
function applyTypewriter() {
  if (!document.body.classList.contains("typewriter") || !searchView) {
    return;
  }
  const view = searchView;
  let coords;
  try {
    coords = view.coordsAtPos(view.state.selection.head);
  } catch {
    return;
  }
  const vpRect = viewport.getBoundingClientRect();
  const targetY = vpRect.top + viewport.clientHeight * 0.4;
  const delta = coords.top - targetY;
  if (Math.abs(delta) > 1) viewport.scrollTop += delta;
}
```

`coordsAtPos` returns viewport-relative coordinates; aligning `coords.top` to a
target 40% down the viewport and adjusting `scrollTop` by the delta pins the
caret there. Instant (no smooth scroll) so fast typing never lags. No scroll
loop risk: scrolling does not change the selection, so it does not re-trigger
the selection listener.

### Lifecycle

- **Toggle on:** add `typewriter` body class, call `applyTypewriter()` once to
  recenter immediately.
- **Toggle off:** remove the body class (no other cleanup; scroll position
  stays where it is).
- Re-applies via the shared listeners (below); no `render()`-specific state.

---

## Component 3 — Shared wiring & menu

### Listener integration (in `render()`)

Both features hook the existing `markdownUpdated` + `selectionUpdated` listeners
the status bar uses. Add `updateFocus()` + `applyTypewriter()` calls to both
callbacks. These run on the editor view directly (not via `updateTitle()`, which
must not scroll). Reset `focusActiveEl = null` at the top of `render()`.

### Menu (`src-tauri/src/menu.rs`)

Two new plain `MenuItem`s in the View submenu, mirroring `toggle_status_bar`:

- `toggle_focus_mode` — label "Focus Mode", accelerator `CmdOrCtrl+Shift+F`,
  emits `toggle-focus-mode`.
- `toggle_typewriter` — label "Typewriter Scrolling", accelerator
  `CmdOrCtrl+Shift+T`, emits `toggle-typewriter`.

Frontend `listen` handlers toggle the respective body class and call the
matching update (and Focus-off cleanup).

---

## Affected files

| File | Change |
|------|--------|
| `src/main.js` | `updateFocus()` + `applyTypewriter()`; reset `focusActiveEl` in `render()`; add calls to both listener callbacks + initial paint; `listen("toggle-focus-mode")` and `listen("toggle-typewriter")`. |
| `src/styles.css` | `body.focus-mode` dim rules. |
| `src-tauri/src/menu.rs` | Two View items + two emit arms. |

No new Rust commands, no permissions, no persistence.

## Testing & verification

- **Frontend build** (`npm run build`) — authoritative bundle check.
- **Rust check** (`~/.cargo/bin/cargo check --manifest-path src-tauri/Cargo.toml`)
  — recompiles capabilities after the menu change.
- **Manual (dev run):**
  - Focus Mode on → current block full opacity, others dimmed; moving the cursor
    re-targets the lit block; toggling off restores all to full opacity.
  - Typewriter on → caret stays ~40% down while typing and navigating; long doc
    scrolls to keep it pinned; toggling off leaves scroll as-is.
  - Both on together behave sanely.
  - Reduced-motion: focus dim transition is effectively instant.
  - Switching documents (open/new) with Focus Mode on does not error (stale node
    reset) and re-marks the new block.

## Risks & mitigations

- **Stale `focusActiveEl` after `render()`** → reset to `null` in `render()`.
- **`before(1)` / `coordsAtPos` throwing at doc edges** → try/catch, no-op.
- **Typewriter feels aggressive on mouse clicks** → accepted convention;
  "only-while-typing" deferred as a future tweak (documented).
