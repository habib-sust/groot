# WYSIWYG Editor — Slice C: Save / Dirty / New / Close-guard — Design

**Date:** 2026-06-05
**Status:** Approved
**Project:** `groot` — Markdown editor (Tauri v2 + Rust, Vite, Milkdown Crepe).
**Part of:** the WYSIWYG epic on `feat/wysiwyg-editor` (merges to `main` only after
Slice D). Builds on Slice B (Crepe is the editable surface).

## Goal (Slice C)
Make editing real: write edits to disk (Save / Save As), track unsaved changes with
a title indicator, create New files, guard the window close when dirty, and reconcile
live-reload with unsaved edits (keep edits when dirty).

## Scope

### In scope
- **Save** (⌘S), **Save As…** (⌘⇧S), **New** (⌘N) — File menu items + flows.
- **Dirty tracking** + a `•` marker in the window title (frontend-owned title).
- **Close guard:** intercept window close when dirty → in-webview Save / Don't Save /
  Cancel prompt.
- **Live-reload reconciliation:** ignore external file changes while dirty; reload
  when clean.

### Out of scope
- find / outline / export / print reintegration (Slice D).
- Autosave; multiple documents / tabs.

## Rust

### Commands (new module `src-tauri/src/fileops.rs`)
- `write_file(path: String, content: String) -> Result<(), String>` —
  `std::fs::write(path, content)`, mapping IO errors to a string. Unit-tested.
- `save_file_as(app, content: String, suggested_name: String) -> Option<String>` —
  opens a native save dialog via `tauri-plugin-dialog`'s **blocking** save
  (`.add_filter("Markdown", &["md","markdown"]).set_file_name(&suggested).blocking_save_file()`),
  and on a chosen path writes `content` and returns the path string; `None` if
  cancelled. (Blocking dialog runs on the command's worker thread. Exact API is
  version-sensitive — verify against the installed `tauri-plugin-dialog`.)

### lib.rs
- Register `fileops::write_file`, `fileops::save_file_as`, plus small helpers:
  - `set_window_title(app, title: String)` → `app.get_webview_window("main").set_title(&title)`.
  - `close_main_window(app)` → `app.get_webview_window("main").destroy()` (or `app.exit(0)`).
- **Close guard** in `setup`: on the main window,
  `WindowEvent::CloseRequested { api, .. }` → `api.prevent_close(); let _ = handle.emit("close-requested", ());`.
  (Add alongside the existing drag-drop `on_window_event`; one handler may cover both
  event variants.)

### menu.rs
- File submenu: add **New** (id `new_file`, ⌘N), **Save** (id `save`, ⌘S),
  **Save As…** (id `save_as`, ⌘⇧S) — after Open Recent, before the Export/Print group
  (sensible grouping). `handle_menu_event` emits `new-file` / `save` / `save-as`.
- **Remove the `set_title` call from `on_file_chosen`** — the title is now
  frontend-owned (so it can show the dirty marker). `open_path` still sets
  current-file state + watcher + emits `open-file`.

## Frontend (`main.js`)

State: `let dirty = false;` (alongside `currentPath`, `currentSource`, `crepe`).

- **Dirty listener:** when creating Crepe, register
  `crepe.on((listener) => listener.markdownUpdated(() => { dirty = true; updateTitle(); }))`.
  After `await crepe.create()` in `render()`, set `dirty = false; updateTitle();` so the
  initial content load doesn't count as an edit.
- **`updateTitle()`:** computes
  `(dirty ? "• " : "") + (currentPath ? basename(currentPath) : "Untitled")`
  (for the launch sample with no path, use `"Groot — Markdown Viewer"`), and calls
  `invoke("set_window_title", { title })`.
- **`save()`** (`save` event / ⌘S): if `currentPath`, `await invoke("write_file", { path: currentPath, content: crepe.getMarkdown() })` → on ok `dirty=false; updateTitle()`; on error `showError`. If no `currentPath`, call `saveAs()`.
- **`saveAs()`** (`save-as`): `const p = await invoke("save_file_as", { content: crepe.getMarkdown(), suggestedName: currentPath ? basename(currentPath) : "untitled.md" })`. If `p`, set `currentPath = p; dirty=false; updateTitle();`. (No path → cancelled; do nothing.)
- **`newFile()`** (`new-file`): if `dirty`, run `confirmUnsaved()` first (below); then `currentPath = null; await render(""); dirty=false; updateTitle();`.
- **Close (`close-requested`):** if `!dirty` → `invoke("close_main_window")`. Else
  `confirmUnsaved()` → `"save"`: `await save(); invoke("close_main_window")`;
  `"discard"`: `invoke("close_main_window")`; `"cancel"`: do nothing.
- **`confirmUnsaved()`** returns a promise resolving to `"save" | "discard" | "cancel"`
  from an **in-webview modal** (`#unsaved-modal` with Save / Don't Save / Cancel
  buttons). Reused by New and Close.
- **Live-reload:** in the `file-changed` handler, `if (dirty) return;` else reload as
  today (which re-`render`s into Crepe).
- Listeners: `listen("save", save)`, `listen("save-as", saveAs)`,
  `listen("new-file", newFile)`, `listen("close-requested", onCloseRequested)`.
- `openPath`/open flows: after loading, `updateTitle()` (title was Rust-set before;
  now frontend sets it). On open, `dirty=false`.

## index.html / styles.css
- `#unsaved-modal` markup (hidden): a small centered card — message + three buttons
  (`#unsaved-save`, `#unsaved-discard`, `#unsaved-cancel`).
- `styles.css`: modal overlay + card styling, themed via the app vars (works in
  light/dark).

## Error / Edge Handling
- `write_file` failure → `showError`; `dirty` stays true (not lost).
- Save As cancelled (`None`) → no change.
- New/Close when not dirty → no prompt.
- Crepe `getMarkdown()` returns the current document markdown for writing.
- Reload while dirty → ignored (edits preserved); when clean → reload.

## Files
- New: `src-tauri/src/fileops.rs`.
- Modify: `src-tauri/src/lib.rs` (commands, helpers, close-requested), `src-tauri/src/menu.rs` (File items; remove on_file_chosen title-set), `src/main.js` (save/dirty/new/close flows), `src/index.html` (modal), `src/styles.css` (modal).

## Testing
- **Unit (Rust):** `write_file` writes content that reads back identically; errors on
  an unwritable path.
- Rust build + existing tests green (24 total with the new `write_file` test);
  `npm run build` clean.
- **GUI:** type → title shows `•`; ⌘S writes (verify file on disk); ⌘⇧S on the sample
  prompts a path + saves + title updates; ⌘N while dirty prompts; closing while dirty
  prompts (Save/Don't Save/Cancel) and behaves; external change ignored while dirty,
  reloads when clean.

## Acceptance Criteria
- ⌘S saves the editor's markdown to the current file (Save As if none); the title's
  `•` clears on save and appears on edit.
- ⌘⇧S always prompts a path and saves; ⌘N (with an unsaved prompt if dirty) starts a
  blank document.
- Closing with unsaved changes prompts Save / Don't Save / Cancel and does the right
  thing.
- An external change to the open file is ignored while there are unsaved edits, and
  reloads when there are none.
- `cargo test` passes (incl. the new `write_file` test); `npm run build` succeeds.
