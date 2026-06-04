# Drag-and-Drop + Copy-Code + Theme Toggle — Design

**Date:** 2026-06-04
**Status:** Approved
**Project:** `groot` — lightweight Markdown viewer (Tauri v2 + Rust).
**Builds on:** the merged highlighting + native-menu + theming work on `main`.

## Goal

Three viewer enhancements:
1. **Drag-and-drop** a `.md` file onto the window to open it.
2. **Copy-code** button on each code block.
3. **Theme toggle** — a native View → Appearance menu (Light / Dark / System),
   persisted, overriding the OS when a manual choice is made.

Plus an end-to-end verification that Open Recent persistence works in the build.

## Feature A — Drag-and-drop to open

Handled in **Rust** so it reuses the existing open logic.

- Refactor `menu.rs`'s `on_file_chosen` into a shared `pub fn open_path<R: Runtime>(app: &AppHandle<R>, path: PathBuf)` that: sets the window title, adds the path to the recent store, persists, rebuilds the menu, and emits `open-file`. Both the menu handlers and drag-drop call it (DRY).
- In `lib.rs` setup, register a window drag-drop handler. On a drop, take the **first** path whose extension is `md`/`markdown` (case-insensitive) and call `open_path`. If none match, emit `open-error` with `"No markdown file in the drop"`.
- The Tauri v2 drag-drop event API is version-sensitive (`WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. })` or similar). The implementer verifies the exact enum/path against the installed `tauri = 2.11.2` and the compiler.

## Feature B — Copy-code button

**Frontend only** (`src/main.js` + `src/styles.css`).

- After each `render()`, iterate `#viewport pre` elements. For each, insert a `<button class="copy-btn">Copy</button>` positioned at the top-right of the `pre` (the `pre` is `position: relative`; the button is absolutely positioned and revealed on `pre:hover`/focus).
- On click: copy the `pre` 's code text (`pre.querySelector("code")?.innerText ?? pre.innerText`) via `navigator.clipboard.writeText` (the Tauri webview is a secure context — no clipboard plugin needed). Briefly change the label to `"Copied!"` for ~1.5s, then restore. On failure, set the label to `"Failed"` briefly.
- Buttons are re-created on every render (the viewport innerHTML is replaced each time), so no stale handlers.

## Feature C — Theme toggle (Appearance)

### Persistence (Rust)
- New module `src-tauri/src/appearance.rs`: an `Appearance` enum `{ Light, Dark, System }` with `as_str()` / `from_str()` (defaulting to `System` on unknown), and `load(&Path)` / `save(&Path)` storing the value as a small JSON string. Missing/corrupt file → `System`.
- Stored at `app_config_dir()/appearance.json`. Held in managed state behind a `Mutex`.

### Native menu (`menu.rs`)
- Add a **View** submenu containing an **Appearance** submenu with three checkable items:
  - ids `appearance_light`, `appearance_dark`, `appearance_system`; labels Light / Dark / System.
  - The item matching the current `Appearance` is checked (radio-like; rebuild on change).
- Menu-event handling: on one of these ids, set the state, persist, rebuild the menu (so the check moves), and `emit("appearance-changed", <value>)` where value is `"light"|"dark"|"system"`.
- Place View between Edit and File (or after File — implementer picks a sensible order; macOS convention is App, File, Edit, View).

### `get_appearance` command (`lib.rs`)
- `#[tauri::command] fn get_appearance(state) -> String` returns the persisted value (`"light"|"dark"|"system"`), registered in the invoke handler so the frontend can read the initial choice on startup.

### CSS refactor (`styles.css`)
- Keep `:root { … light vars … }` as the default.
- Replace the `@media (prefers-color-scheme: dark) { :root { … } }` block with
  `:root[data-theme="dark"] { … same dark vars … }`. (Dark applies only when the
  attribute is set — the frontend sets it based on the resolved theme.)

### `syntax_css(theme)` change (`markdown.rs`)
- Change signature to `#[tauri::command] pub fn syntax_css(theme: String) -> String`.
- Return the class CSS for the requested theme only, with **no** media wrapper:
  - `"dark"` → `css_for_theme_with_class_style(dark_theme(), CLASS_STYLE)`
  - anything else (default `"light"`) → `css_for_theme_with_class_style(theme(), CLASS_STYLE)`
- The frontend re-injects the `<style id="syntax-theme">` content whenever the effective theme changes.

### Frontend logic (`main.js`)
- `resolveEffective(choice)`: if `choice === "system"`, return `matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"`; else return `choice`.
- `applyTheme(choice)`: compute effective; set `document.documentElement.dataset.theme = effective`; `invoke("syntax_css", { theme: effective })` and set the `<style id="syntax-theme">` text. Manage a single `matchMedia` change listener that is active only while `choice === "system"` (re-applies on OS change).
- On startup: `const choice = await invoke("get_appearance"); applyTheme(choice);` then render the sample.
- Listen for `appearance-changed` → `applyTheme(event.payload)`.

## Data Flow (appearance)
Launch → frontend `get_appearance` → `applyTheme` (sets `data-theme` + injects matching syntax CSS) → render. User picks View→Appearance→X → Rust saves + rebuilds menu + emits `appearance-changed` → frontend `applyTheme(X)`. In System mode, an OS appearance change fires the `matchMedia` listener → re-apply.

## Error Handling
- Drop with no markdown → `open-error` shown in the viewport; non-first/extra files ignored.
- Copy failure → transient "Failed" label; no crash.
- Corrupt/missing `appearance.json` → `System`.
- `syntax_css` unknown theme string → treated as light.

## Testing
- **`appearance.rs`:** `from_str`/`as_str` round-trip incl. unknown→System; `save` then `load` returns the same value; `load` of a missing path → System.
- **`markdown.rs`:** `syntax_css("light")` contains `#b06a7a` and NOT `prefers-color-scheme`; `syntax_css("dark")` contains `#d98c9a` and NOT `prefers-color-scheme`.
- Existing markdown/recent/highlighting tests stay green (note: `parse_markdown`, `read_markdown_file` unchanged).
- **GUI smoke:** drag-drop opens a `.md` (and updates Open Recent + title); copy button copies; Appearance Light/Dark/System work and persist across restart; System mode follows live OS changes; Open Recent persists across restart (the requested verification); `<script>` still inert.

## Files
- New: `src-tauri/src/appearance.rs`.
- Modified: `src-tauri/src/lib.rs` (state, `get_appearance`, drag-drop wiring, register), `src-tauri/src/menu.rs` (View→Appearance, shared `open_path`), `src-tauri/src/markdown.rs` (`syntax_css(theme)`), `src/main.js` (appearance + copy buttons), `src/styles.css` (`data-theme` refactor + `.copy-btn`).

## Acceptance Criteria
- Dropping a `.md` opens it (title + Open Recent update); dropping non-md shows an error.
- Each code block has a hover Copy button that copies its text.
- View → Appearance offers Light/Dark/System, the active one checked; the choice persists across restarts; System follows the OS live.
- Switching appearance updates both the page chrome and the code colors.
- `cargo test` passes (with new `appearance` tests and updated `syntax_css` tests).
