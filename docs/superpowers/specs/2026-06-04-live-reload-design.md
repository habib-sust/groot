# Live-Reload on External File Change — Design

**Date:** 2026-06-04
**Status:** Approved
**Project:** `groot` — lightweight Markdown viewer (Tauri v2 + Rust).
**Builds on:** the merged viewer on `main`.

## Goal

When the currently-open file changes on disk (edited in another app), the viewer
automatically re-renders it, preserving the scroll position.

## Scope

### In scope
- Watch the open file via `notify` + `notify-debouncer-mini` (parent-directory
  watch, filtered to the open file; debounced).
- Track the currently-open file in Rust state; re-point the watcher when a
  different file is opened.
- On a debounced change, emit a `file-changed` event; the frontend re-reads and
  re-renders the file, preserving scroll position.

### Out of scope (deferred)
- A toggle to disable live-reload (always-on).
- Watching multiple files / tabs.
- Reloading the built-in sample (no file → nothing watched).

## Architecture

### Dependencies
Add `notify` and `notify-debouncer-mini` to `src-tauri/Cargo.toml`. The debouncer
coalesces editors' rapid and atomic (write-temp-then-rename) saves. The exact
debouncer API is version-sensitive — the implementer verifies against the installed
version (`new_debouncer(timeout, handler)` → a `Debouncer` whose `.watcher()` you
`watch(path, RecursiveMode::NonRecursive)`).

### State (Rust)
- Managed `Mutex<Option<PathBuf>>` — the **current file** (None when showing the
  sample).
- `watcher.rs` owns a small `WatchState { debouncer, watched_dir: Option<PathBuf> }`
  managed as `Mutex<WatchState>`. Keeping the debouncer alive keeps the watch
  active; dropping it stops watching.

### Watcher
- Created once in `setup`. Its debounced callback runs on a background thread and:
  - reads the current-file state,
  - if any changed path equals the current file (pure helper `path_matches`),
  - calls `app.emit("file-changed", <path string>)`.
- The callback is **emit-only** (no menu/UI construction), so the background thread
  is safe (unlike menu rebuilds, which must be on the main thread).
- It watches the **parent directory** of the current file, non-recursive. Watching
  the directory (not the file inode) survives atomic save-via-rename and catches
  delete-then-recreate. Events for other files in the directory are filtered out by
  the exact-path match.

### Re-point on open (`menu.rs`)
`open_path` (the shared open path used by the dialog, Open Recent, and drag-drop)
additionally:
- sets the current-file state to the opened path, and
- calls `watcher::watch_file(app, &path)`, which (under the `WatchState` lock)
  unwatches the previously-watched dir (if different) and watches the new file's
  parent dir.

### Frontend reload (`main.js`)
- `listen("file-changed", (e) => reloadInPlace(e.payload))`.
- `reloadInPlace(path)`: capture `viewport.scrollTop`; `await openPath(path)` (which
  re-reads via `read_markdown_file` and re-renders — rebuilding highlight/copy/
  outline); then restore `viewport.scrollTop` to the captured value.
- Reload does not change the window title or Open Recent (those happen Rust-side in
  `open_path` only on a real open, not on `file-changed`).

## Data Flow
Open a file → `open_path` sets current-file + points the watcher at its directory →
emits `open-file` → frontend renders. External edit → debouncer fires → callback
matches the current file → emits `file-changed { path }` → frontend `reloadInPlace`
(scroll preserved). Open a different file → watcher re-points; only that file's
changes reload.

## Error / Edge Handling
- Deleted file → the re-read fails → existing `showError` path (or no-op); a later
  re-create/re-save in the watched directory triggers a fresh reload.
- Switching files → watcher re-points to the new directory.
- Other files in the same directory → filtered out by exact-path match.
- Rapid/atomic saves → debounced (~200ms).
- No file open (sample) → current-file is None; the watcher watches nothing and the
  callback no-ops.

## Files
- `src-tauri/Cargo.toml` — add `notify`, `notify-debouncer-mini`.
- `src-tauri/src/watcher.rs` — **new:** `WatchState`, `init_watcher`/`watch_file`,
  the debounced callback, and a pure `path_matches(changed: &[PathBuf], current: &Path) -> bool`.
- `src-tauri/src/lib.rs` — `mod watcher`; manage current-file + `WatchState`; build
  the watcher in `setup`.
- `src-tauri/src/menu.rs` — `open_path` updates current-file + re-points the watcher.
- `src/main.js` — `listen("file-changed")` → scroll-preserving reload.

## Testing
- **Unit (Rust):** `path_matches` — returns true when the changed list contains the
  current path, false otherwise (incl. empty list and different paths).
- The watcher's FS-event/timing behavior and the scroll-preserving reload are
  verified in the GUI smoke test (open a file, `echo >> file` from a terminal, see
  it reload in place with scroll preserved).
- Rust build + existing 21 tests stay green; `node --check src/main.js` passes.

## Acceptance Criteria
- Editing the open file in another app re-renders it in groot within ~½ second,
  without manual reload.
- The scroll position is preserved across the reload.
- Switching files moves the watch to the new file; only the open file triggers a
  reload.
- The window title and Open Recent are unaffected by reloads.
- `cargo test` passes (21 + the new `path_matches` test); the Rust builds clean.
