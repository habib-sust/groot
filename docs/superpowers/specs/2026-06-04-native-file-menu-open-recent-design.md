# Native File Menu + Open Recent — Design

**Date:** 2026-06-04
**Status:** Approved
**Project:** `groot` — lightweight Markdown viewer (Tauri v2 + Rust).
**Builds on:** [2026-06-04-markdown-viewer-iteration-1-design.md](./2026-06-04-markdown-viewer-iteration-1-design.md)

## Goal

Replace the in-window "Open File" button with a **native macOS menu**. Add a
**File** menu containing "Open File…" (⌘O) and an "Open Recent" submenu that
persists across app restarts (up to 10 entries, most-recent-first, with "Clear
Recent").

## Scope

### In scope
- A native application menu built in Rust via Tauri v2's menu API.
- A **File** submenu: `Open File…` (⌘O), `Open Recent ▸` (dynamic), `Clear Recent`.
- Recent-files history persisted to disk as JSON, surviving restarts, capped at 10.
- Removal of the in-window `#open-file` button and `.toolbar` (menu-only).
- Frontend listens for an `open-file` event and renders the chosen file.

### Out of scope (deferred)
- Auto-pruning recent entries whose file no longer exists.
- Per-platform menu polish beyond macOS (Windows/Linux render in-window; acceptable).
- Configurable recent-count (fixed at 10).
- "Open Folder" / workspace concepts.
- Editing (still viewer-only).

## Architecture

The native menu (Rust) **owns** file selection and recent-history; the webview
only renders. Clean split:
- **Rust** — menu construction, native file dialog, recent-files persistence,
  emitting an `open-file` event to the webview.
- **Frontend** — listens for `open-file`, then reuses the existing
  `read_markdown_file` + `parse_markdown` commands to render into `#viewport`.

### New Rust modules
- **`src-tauri/src/recent_files.rs`** — the recent-files store: list logic +
  JSON load/save. One clear responsibility, unit-testable without an app handle.
- **`src-tauri/src/menu.rs`** — builds the menu and rebuilds the Open-Recent
  submenu; defines the menu-event handler.

### Menu structure
```
File
├── Open File…            ⌘O          (id: "open_file")
├── Open Recent  ▸
│     ├── <path 1>                     (id: <path 1>)
│     ├── … up to 10, most-recent first
│     ├── ─────────────
│     └── Clear Recent                 (id: "clear_recent")
└── (default Quit / Close Window items remain)
```
When the recent list is empty, "Open Recent" contains a single disabled
"No Recent Files" item.

## Components

### `RecentFiles` (recent_files.rs)
A struct wrapping `Vec<PathBuf>`, stored in Tauri managed state behind a `Mutex`.
- `add(path)` — remove any existing equal path, insert at front, truncate to 10
  (dedup + most-recent-first + cap).
- `clear()` — empty the list.
- `list() -> &[PathBuf]`.
- `load(path)` — read JSON from disk; missing or corrupt → empty list (no panic).
- `save(path)` — serialize to JSON and write.

Persistence location: `app.path().app_config_dir()/recent_files.json`, written
with `std::fs` (Rust-side fs is not gated by Tauri capabilities).

### `menu.rs`
- `build_menu(app) -> Menu` — constructs the full app menu including the File
  submenu and the Open-Recent submenu populated from the current store.
- `rebuild_recent(submenu, store)` — clears and repopulates the Open-Recent
  submenu items from the store (or the disabled "No Recent Files" placeholder).
- The menu-event handler matches on item id:
  - `"open_file"` → open native dialog (filtered to `md`/`markdown`); on pick,
    `add` to store, save, rebuild submenu, emit `open-file { path }`.
  - `"clear_recent"` → `clear`, save, rebuild submenu.
  - any other id (a path) → `add` (moves to front), save, rebuild, emit
    `open-file { path }`.

### lib.rs wiring
- Register the `RecentFiles` state (loaded from disk at startup).
- In `setup`, build and set the menu, keep a handle to the Open-Recent submenu
  for rebuilds, load persisted recents, populate the submenu.
- Register the menu-event handler via `on_menu_event`.

## Data Flow

- **Launch:** frontend renders the built-in SAMPLE (unchanged). Rust loads the
  persisted store and builds the menu with Open Recent populated.
- **Open File… (⌘O):** Rust dialog → pick `.md` → store.add + save + rebuild →
  emit `open-file { path }` → frontend `read_markdown_file` → `parse_markdown` →
  inject.
- **Open Recent ▸ <path>:** Rust moves path to front + save + rebuild → emit
  `open-file { path }` → frontend renders.
- **Clear Recent:** Rust clears + save + rebuild (submenu shows disabled
  "No Recent Files").

## Error Handling
- Frontend read failure (recent file moved/deleted) → existing red ⚠️ message in
  the viewport. Dead entries are **not** auto-pruned this iteration.
- Corrupt/missing `recent_files.json` → treated as empty list; no crash.

## Permissions Impact
- The native dialog now runs in Rust, so the frontend no longer calls the JS
  dialog API. The `dialog:default` capability is no longer required by the
  frontend and may be removed from `capabilities/default.json` (the
  `tauri-plugin-dialog` Rust plugin registration stays, since the Rust dialog API
  is used).
- The frontend now listens for a Rust-emitted event. If event listening is not
  already covered by `core:default`, add `core:event:default` to
  `capabilities/default.json`. The implementer verifies and adjusts.

## Frontend Cleanup
- `src/index.html`: remove the `#open-file` button and the `.toolbar` header; the
  body becomes just `#viewport`.
- `src/styles.css`: remove the now-unused `.toolbar` rules.
- `src/main.js`: remove the button wiring; add a listener for the `open-file`
  event (`window.__TAURI__.event.listen`) that calls `read_markdown_file` +
  `parse_markdown` + injects. SAMPLE-on-launch stays.

## Testing
- Rust unit tests for `RecentFiles`:
  - `add` dedups (same path twice → one entry, at front).
  - `add` caps at 10 and keeps most-recent-first ordering.
  - `clear` empties the list.
  - JSON round-trip: `save` then `load` returns the same list.
- Menu construction, click events, and the native dialog are GUI-only — covered
  by the manual smoke test.

## Acceptance Criteria
- A native **File** menu appears in the macOS menu bar with "Open File…" (⌘O),
  "Open Recent", and "Clear Recent".
- ⌘O / "Open File…" opens the native dialog; choosing a `.md` renders it.
- After opening files, "Open Recent" lists them most-recent-first (max 10).
- Recent list persists across an app restart.
- "Clear Recent" empties the list (submenu shows "No Recent Files").
- The in-window "Open File" button is gone.
- `cargo test` passes (including the new `RecentFiles` tests).
