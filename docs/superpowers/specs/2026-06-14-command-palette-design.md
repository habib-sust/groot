# Command Palette — Design (Phase 3 of UX Polish)

**Date:** 2026-06-14
**Status:** Approved for planning
**Phase:** 3 of 3 in the "real editor feel" UX polish theme
 (Phase 1 — status bar + micro-polish, shipped. Phase 2 — removed.)

## Background & rationale

Phase 3 adds a **⌘K command palette**: a centered modal with a filter input and
a keyboard-navigable command list. Each row shows the command name and its
keyboard shortcut **inline**, so the palette doubles as the shortcut-discovery
surface — no separate cheatsheet (folded in per the brainstorming decision).

Frontend-only except one Rust menu item. The palette invokes existing frontend
functions directly; no new backend commands, no persistence.

## Goals

- A ⌘K palette listing the app's frontend actions, filterable by typing,
  navigable by keyboard, runnable by Enter or click.
- Each row displays the command's keyboard shortcut inline (discoverability).

## Decisions (from brainstorming)

- **Command set (v1):** frontend-actionable only — New, Save, Save As, Find,
  Toggle Outline, Toggle Status Bar, Export as HTML, Print. (Open File / Open
  Recent / Appearance excluded — they'd need new backend wiring.)
- **No separate cheatsheet** — shortcuts shown inline in palette rows.
- **Trigger:** native View-menu item "Command Palette…" with ⌘K, emitting a
  `command-palette` event (consistent with Find/toggles; reliable regardless of
  editor focus).
- **Filtering:** case-insensitive substring match on the label (≈8 commands; no
  fuzzy matching needed).

## Non-goals

- Open File / Open Recent / theme switching from the palette (future).
- Fuzzy/scored search; command history; recently-used ordering.
- A standalone keyboard-shortcuts modal.

---

## Component 1 — Palette UI

### Markup (`src/index.html`)

A modal overlay, sibling to `#unsaved-modal`:

```html
<div id="command-palette" hidden>
  <div class="palette-card">
    <input id="palette-input" type="text" placeholder="Type a command…"
           autocomplete="off" spellcheck="false" />
    <ul id="palette-list"></ul>
  </div>
</div>
```

### Styling (`src/styles.css`)

Reuses the existing modal language (overlay + card + palette tokens). The card
is anchored toward the **upper third** (palette convention), not vertically
centered. Each list row: command label left, shortcut hint right (muted,
monospace). The active row is highlighted with `--accent-soft`. Scrollable list
with a max-height. Hidden via `[hidden]`. Reuses the Phase 1 `modal-fade`/`pop`
animation feel; honored by the existing `prefers-reduced-motion` rule.

---

## Component 2 — Command registry & behavior (`src/main.js`)

### Registry

A static array; each entry has a label, an inline shortcut hint (string matching
the Rust accelerator), and a `run` thunk calling an existing frontend function:

```js
const COMMANDS = [
  { label: "New File",          hint: "⌘N",  run: () => newFile() },
  { label: "Save",              hint: "⌘S",  run: () => save() },
  { label: "Save As…",          hint: "⇧⌘S", run: () => saveAs() },
  { label: "Find…",             hint: "⌘F",  run: () => openFind() },
  { label: "Toggle Outline",    hint: "⇧⌘O", run: () => toggleOutline() },
  { label: "Toggle Status Bar", hint: "⌘/",  run: () => toggleStatusBar() },
  { label: "Export as HTML…",   hint: "",    run: () => exportHtml() },
  { label: "Print…",            hint: "⌘P",  run: () => printDocument() },
];
```

### Prerequisite refactor

Toggle Status Bar is currently inline in the `toggle-status-bar` listener.
Extract a `toggleStatusBar()` function and call it from both that listener and
the palette (DRY).

### State & functions

- `openPalette()` — unhide, clear input, render full list, `activeIndex = 0`,
  focus input.
- `closePalette()` — hide; return focus to the editor (`searchView?.focus()`).
- `renderPalette(filter)` — compute the filtered list (substring on label,
  lowercased), render rows, clamp/reset `activeIndex`, mark the active row.
- `runActive()` — if the filtered list is non-empty, `closePalette()` THEN run
  the active command's `run()` (close first so commands that open their own UI —
  Find, Save dialogs — aren't fighting the palette).

### Interactions

- Input `input` event → `renderPalette(value)`.
- Input `keydown`: ArrowDown/ArrowUp move `activeIndex` (wrap around), Enter →
  `runActive()`, Esc → `closePalette()`.
- Row `click` → set active to that row and `runActive()`.
- Empty filter result → show a muted "No matching commands" row; Enter is a
  no-op.

### Lifecycle note

The palette DOM lives outside `#viewport`, so it is **not** destroyed by
`render()` — unlike find/outline/status bar, it needs no per-render re-attach.
Its wiring is set up once at startup.

---

## Component 3 — Menu trigger (`src-tauri/src/menu.rs`)

Add a "Command Palette…" `MenuItem` (id `command_palette`, accelerator
`CmdOrCtrl+K`) to the View submenu, and a dispatch arm emitting `command-palette`.
Frontend `listen("command-palette", () => openPalette())`.

```rust
let command_palette = MenuItemBuilder::new("Command Palette…")
    .id("command_palette")
    .accelerator("CmdOrCtrl+K")
    .build(app)?;
// View submenu: command_palette + separator above the appearance/toggles.
```

---

## Affected files

| File | Change |
|------|--------|
| `src/index.html` | `#command-palette` modal markup. |
| `src/styles.css` | Palette overlay/card/row styles (reusing modal + palette tokens). |
| `src/main.js` | `COMMANDS` registry; `openPalette`/`closePalette`/`renderPalette`/`runActive`; extract `toggleStatusBar()`; `listen("command-palette")`. |
| `src-tauri/src/menu.rs` | "Command Palette…" View item (⌘K) + emit arm. |

No new Rust commands, no permissions, no persistence.

## Testing & verification

- **Frontend build** (`npm run build`).
- **Rust check** (`~/.cargo/bin/cargo check --manifest-path src-tauri/Cargo.toml`)
  — recompiles capabilities after the menu change.
- **Manual (dev run):**
  - ⌘K opens the palette focused on the input; all 8 commands listed with their
    shortcuts.
  - Typing filters (e.g. "sa" → Save, Save As); ArrowUp/Down move the highlight
    and wrap; Enter runs the highlighted command; click runs a command.
  - Esc closes; focus returns to the editor.
  - Running each command works: New, Save (toast), Save As (dialog), Find (find
    bar opens after palette closes), Toggle Outline, Toggle Status Bar, Export,
    Print.
  - No-match query shows the empty row and Enter does nothing.
  - Light/dark: palette reads correctly in both themes.

## Risks & mitigations

- **Shortcut hints drift from the Rust accelerators** → small static list;
  documented that the hint strings mirror `menu.rs`. (Acceptable; only 8 items.)
- **⌘K captured by the editor** → use a native menu accelerator (same mechanism
  as ⌘F Find, which works), not a webview keydown listener.
- **Running a command while the palette is still open** → `runActive()` closes
  first, then runs.
