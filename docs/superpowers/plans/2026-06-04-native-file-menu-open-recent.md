# Native File Menu + Open Recent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-window "Open File" button with a native macOS File menu offering "Open File…" (⌘O) and a persisted "Open Recent" submenu (max 10).

**Architecture:** A native app menu built in Rust (Tauri v2 menu API) owns file selection and recent-history. On a menu action, Rust opens the native dialog, updates a persisted recent-files store, rebuilds the menu, and emits an `open-file` event to the webview. The frontend listens and reuses the existing `read_markdown_file` + `parse_markdown` commands to render. Two new Rust modules: `recent_files.rs` (store) and `menu.rs` (menu build + event handling).

**Tech Stack:** Rust, Tauri v2 (`tauri::menu`, `tauri::Emitter`, `tauri::Manager`), `tauri-plugin-dialog` (Rust `DialogExt`), `serde_json`, vanilla JS (`window.__TAURI__`).

---

## ⚠️ Note on the Tauri v2 menu/dialog/event API (read before Task 2)

The exact method names in Tauri's menu, dialog, and event APIs are version-sensitive. The installed versions are `tauri = 2.11.2`, `tauri-plugin-dialog = 2.7.1`. The code in Task 2 reflects the Tauri 2.x API, but if `cargo build` reports a method/signature mismatch (e.g. `into_path` vs `as_path`, `event.id().as_ref()` vs `.0`, `MenuItemBuilder::enabled` vs `.enabled(true)`), the implementer must look up the correct call for the installed version — use the context7 MCP docs (resolve `/tauri-apps/tauri-docs`, query the specific API) or `cargo doc` — and adjust the call **without changing the described behavior**. Do not invent behavior; only fix API surface.

---

## File Structure

- `src-tauri/src/recent_files.rs` — **new.** `RecentFiles` store: dedup/cap/order list logic + JSON load/save. Pure, unit-tested.
- `src-tauri/src/menu.rs` — **new.** Build the app menu, rebuild on change, handle menu-click events (dialog, persistence, emit).
- `src-tauri/src/lib.rs` — **modify.** Declare new modules; in `setup` load store + build/set menu + manage state; register `on_menu_event`; add a `recent_store_path` helper.
- `src/index.html` — **modify.** Remove `.toolbar` + `#open-file` button (viewport only).
- `src/styles.css` — **modify.** Remove `.toolbar` rules.
- `src/main.js` — **modify.** Remove button wiring; add `open-file` event listener.
- `src-tauri/capabilities/default.json` — **modify.** Remove now-unused `dialog:default` (JS no longer calls the dialog).

---

## Task 1: `RecentFiles` store (TDD)

**Files:**
- Create: `src-tauri/src/recent_files.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod recent_files;` so it compiles + tests run)

- [ ] **Step 1: Create `recent_files.rs` with implementation + failing tests**

Create `src-tauri/src/recent_files.rs`:

```rust
use std::path::{Path, PathBuf};

const MAX_RECENT: usize = 10;

/// In-memory list of recently opened file paths, most-recent-first, deduped,
/// capped at MAX_RECENT. Persisted to disk as a JSON array of paths.
#[derive(Default)]
pub struct RecentFiles {
    items: Vec<PathBuf>,
}

impl RecentFiles {
    pub fn new() -> Self {
        Self::default()
    }

    /// Insert `path` at the front, removing any existing duplicate, capped at MAX_RECENT.
    pub fn add(&mut self, path: PathBuf) {
        self.items.retain(|p| p != &path);
        self.items.insert(0, path);
        self.items.truncate(MAX_RECENT);
    }

    pub fn clear(&mut self) {
        self.items.clear();
    }

    pub fn list(&self) -> &[PathBuf] {
        &self.items
    }

    /// Load from a JSON file. A missing or corrupt file yields an empty list.
    pub fn load(path: &Path) -> Self {
        let items = std::fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str::<Vec<PathBuf>>(&s).ok())
            .unwrap_or_default();
        Self { items }
    }

    /// Serialize to a JSON file.
    pub fn save(&self, path: &Path) -> Result<(), String> {
        let json = serde_json::to_string_pretty(&self.items).map_err(|e| e.to_string())?;
        std::fs::write(path, json).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_inserts_most_recent_first() {
        let mut r = RecentFiles::new();
        r.add(PathBuf::from("/a.md"));
        r.add(PathBuf::from("/b.md"));
        assert_eq!(r.list(), &[PathBuf::from("/b.md"), PathBuf::from("/a.md")]);
    }

    #[test]
    fn add_dedups_and_moves_to_front() {
        let mut r = RecentFiles::new();
        r.add(PathBuf::from("/a.md"));
        r.add(PathBuf::from("/b.md"));
        r.add(PathBuf::from("/a.md"));
        assert_eq!(r.list(), &[PathBuf::from("/a.md"), PathBuf::from("/b.md")]);
    }

    #[test]
    fn add_caps_at_ten() {
        let mut r = RecentFiles::new();
        for i in 0..15 {
            r.add(PathBuf::from(format!("/{i}.md")));
        }
        assert_eq!(r.list().len(), 10);
        assert_eq!(r.list()[0], PathBuf::from("/14.md"));
        assert_eq!(r.list()[9], PathBuf::from("/5.md"));
    }

    #[test]
    fn clear_empties() {
        let mut r = RecentFiles::new();
        r.add(PathBuf::from("/a.md"));
        r.clear();
        assert!(r.list().is_empty());
    }

    #[test]
    fn save_then_load_roundtrip() {
        let mut r = RecentFiles::new();
        r.add(PathBuf::from("/a.md"));
        r.add(PathBuf::from("/b.md"));
        let mut path = std::env::temp_dir();
        path.push("groot_recent_roundtrip_test.json");
        r.save(&path).unwrap();
        let loaded = RecentFiles::load(&path);
        assert_eq!(loaded.list(), r.list());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn load_missing_file_is_empty() {
        let loaded = RecentFiles::load(Path::new("/no/such/groot_recent.json"));
        assert!(loaded.list().is_empty());
    }
}
```

- [ ] **Step 2: Register the module**

In `src-tauri/src/lib.rs`, add near the top with the other `mod` lines:

```rust
mod recent_files;
```

- [ ] **Step 3: Run the tests**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml recent_files 2>&1 | tail -20`
Expected: `test result: ok. 6 passed`.

(The implementation is written alongside the tests here because it is small, pure logic; the tests fully pin the dedup/cap/order/roundtrip behavior. If any test fails, fix the implementation — not the test — until all 6 pass.)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/recent_files.rs src-tauri/src/lib.rs
git commit -m "feat: add RecentFiles store with persistence"
```

---

## Task 2: Native menu, dialog, persistence wiring

**Files:**
- Create: `src-tauri/src/menu.rs`
- Modify: `src-tauri/src/lib.rs`

Re-read the ⚠️ API note above before starting. Verify each Tauri API call compiles; fix method names against the installed version if needed, preserving behavior.

- [ ] **Step 1: Create `menu.rs`**

Create `src-tauri/src/menu.rs`:

```rust
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_dialog::DialogExt;

use crate::recent_files::RecentFiles;

/// Build the full application menu: an app submenu (Close Window, Quit) and a
/// File submenu (Open File…, Open Recent ▸). The Open Recent submenu is
/// populated from the current recent-files list, or shows a disabled
/// "No Recent Files" item when empty.
pub fn build_app_menu<R: Runtime>(
    app: &AppHandle<R>,
    recent: &RecentFiles,
) -> tauri::Result<Menu<R>> {
    let app_menu = SubmenuBuilder::new(app, "Groot")
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let open_file = MenuItemBuilder::new("Open File…")
        .id("open_file")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;

    let mut recent_builder = SubmenuBuilder::new(app, "Open Recent");
    if recent.list().is_empty() {
        let none = MenuItemBuilder::new("No Recent Files")
            .id("no_recent")
            .enabled(false)
            .build(app)?;
        recent_builder = recent_builder.item(&none);
    } else {
        for path in recent.list() {
            let label = path.to_string_lossy().to_string();
            let item = MenuItemBuilder::new(&label).id(label.clone()).build(app)?;
            recent_builder = recent_builder.item(&item);
        }
        recent_builder = recent_builder.separator();
        let clear = MenuItemBuilder::new("Clear Recent")
            .id("clear_recent")
            .build(app)?;
        recent_builder = recent_builder.item(&clear);
    }
    let recent_submenu = recent_builder.build()?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&open_file)
        .item(&recent_submenu)
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .build()
}

/// Dispatch a menu click by item id.
pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    match id {
        "open_file" => {
            let app = app.clone();
            app.clone()
                .dialog()
                .file()
                .add_filter("Markdown", &["md", "markdown"])
                .pick_file(move |file_path| {
                    if let Some(fp) = file_path {
                        if let Ok(path) = fp.into_path() {
                            on_file_chosen(&app, path);
                        }
                    }
                });
        }
        "clear_recent" => {
            {
                let state = app.state::<Mutex<RecentFiles>>();
                state.lock().unwrap().clear();
            }
            persist_and_refresh(app);
        }
        "no_recent" => {}
        path => {
            on_file_chosen(app, PathBuf::from(path));
        }
    }
}

/// Add the chosen path to recents, persist, rebuild the menu, and tell the
/// webview to render it.
fn on_file_chosen<R: Runtime>(app: &AppHandle<R>, path: PathBuf) {
    {
        let state = app.state::<Mutex<RecentFiles>>();
        state.lock().unwrap().add(path.clone());
    }
    persist_and_refresh(app);
    let _ = app.emit("open-file", path.to_string_lossy().to_string());
}

/// Save the store to disk and rebuild + set the menu from current state.
fn persist_and_refresh<R: Runtime>(app: &AppHandle<R>) {
    let store_path = crate::recent_store_path(app);
    let menu = {
        let state = app.state::<Mutex<RecentFiles>>();
        let guard = state.lock().unwrap();
        let _ = guard.save(&store_path);
        build_app_menu(app, &guard)
    };
    if let Ok(menu) = menu {
        let _ = app.set_menu(menu);
    }
}
```

- [ ] **Step 2: Wire `lib.rs`**

Replace the contents of `src-tauri/src/lib.rs` with (preserve the `#[cfg_attr(mobile, ...)]` attribute exactly as currently generated):

```rust
mod markdown;
mod menu;
mod recent_files;

use std::sync::Mutex;

use tauri::Manager;

use recent_files::RecentFiles;

/// Path to the persisted recent-files JSON, inside the app config dir.
pub(crate) fn recent_store_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> std::path::PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .expect("failed to resolve app config dir");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("recent_files.json")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            markdown::parse_markdown,
            markdown::read_markdown_file
        ])
        .setup(|app| {
            let handle = app.handle();
            let store_path = recent_store_path(handle);
            let recent = RecentFiles::load(&store_path);
            let menu = menu::build_app_menu(handle, &recent)?;
            app.set_menu(menu)?;
            app.manage(Mutex::new(recent));
            Ok(())
        })
        .on_menu_event(|app, event| {
            menu::handle_menu_event(app, event.id().as_ref());
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Build and fix any API mismatches**

Run: `~/.cargo/bin/cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -40`
Expected: `Finished` with no errors. If there are errors, they will almost certainly be Tauri-API surface mismatches (see the ⚠️ note) — fix the offending call to the correct form for the installed version, preserving the behavior described in the comments. Common things to check:
- `event.id().as_ref()` returns `&str` — if not, use the correct accessor to get the id string.
- The dialog callback's argument type and how to get a `PathBuf` from it (`into_path()` / `as_path()` / `into_path_buf()`).
- `MenuItemBuilder::enabled(false)` for the disabled placeholder.
- `PredefinedMenuItem::quit(app, None)` / `close_window(app, None)` signatures.
- Whether the `menu`/`Emitter`/`Manager` traits need importing for `set_menu` / `emit` / `state`.

Iterate on `cargo build` until clean.

- [ ] **Step 4: Confirm existing tests still pass**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -15`
Expected: all tests pass (the 5 markdown/read tests + 6 recent_files tests = 11).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/menu.rs src-tauri/src/lib.rs
git commit -m "feat: add native File menu with Open Recent and persistence"
```

---

## Task 3: Frontend — remove button, listen for `open-file`

**Files:**
- Modify: `src/index.html`
- Modify: `src/styles.css`
- Modify: `src/main.js`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Remove the toolbar from `index.html`**

Replace the `<body>` of `src/index.html` so it contains only the viewport and the script (keep the existing `<head>` and the script's existing path style):

```html
  <body>
    <main id="viewport" class="markdown-body"></main>
    <script type="module" src="/main.js"></script>
  </body>
```

- [ ] **Step 2: Remove the `.toolbar` rules from `styles.css`**

In `src/styles.css`, delete the `.toolbar`, `.toolbar button`, and `.toolbar button:hover` rule blocks. Leave everything else (the `:root` vars, `#viewport`, `.markdown-body …`, `.error`) unchanged.

- [ ] **Step 3: Replace `src/main.js`**

Replace the entire contents of `src/main.js` with:

```js
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const viewport = document.querySelector("#viewport");

const SAMPLE = `# Welcome to Groot

A lightweight **Markdown viewer** built with Tauri + Rust.

- Use the **File** menu → **Open File…** (⌘O) to view a \`.md\` file.
- Recently opened files appear under **File → Open Recent**.
- Rendering is powered by \`pulldown-cmark\`, sanitized with \`ammonia\`.

## Example code

\`\`\`
fn main() {
    println!("hello, groot");
}
\`\`\`

> Editing is coming in a later iteration.
`;

function showError(message) {
  viewport.innerHTML = `<p class="error">⚠️ ${message}</p>`;
}

async function render(markdown) {
  try {
    viewport.innerHTML = await invoke("parse_markdown", { content: markdown });
  } catch (e) {
    showError(String(e));
  }
}

async function openPath(path) {
  try {
    const content = await invoke("read_markdown_file", { path });
    await render(content);
  } catch (e) {
    showError(String(e));
  }
}

// The native File menu (Rust) emits "open-file" with the chosen path.
listen("open-file", (event) => {
  openPath(event.payload);
});

window.addEventListener("DOMContentLoaded", () => {
  render(SAMPLE);
});
```

- [ ] **Step 4: Remove the now-unused dialog permission**

The frontend no longer calls the JS dialog API (the dialog runs in Rust). In `src-tauri/capabilities/default.json`, remove the `"dialog:default"` entry from `permissions`, leaving `"core:default"` (which already covers event listening). The array becomes:

```json
  "permissions": [
    "core:default"
  ]
```

- [ ] **Step 5: Syntax-check the JS and build the Rust**

Run: `node --check src/main.js`
Expected: no output (syntax OK).

Run: `~/.cargo/bin/cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`
Expected: `Finished`, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/index.html src/styles.css src/main.js src-tauri/capabilities/default.json
git commit -m "feat: drive file open from native menu, remove toolbar button"
```

---

## Task 4: Verification

**Files:** none (verification only)

- [ ] **Step 1: Full Rust test suite**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -15`
Expected: all 11 tests pass.

- [ ] **Step 2: GUI smoke test (run by the human — needs a desktop window)**

The controller will hand these steps to the user (subagents cannot drive a GUI). Run `npm run tauri dev`, then verify against the spec acceptance criteria:
- [ ] A native **File** menu appears in the macOS menu bar with "Open File…" (⌘O) and "Open Recent".
- [ ] On launch the window shows the rendered "Welcome to Groot" sample; there is **no** in-window "Open File" button.
- [ ] ⌘O (or File → Open File…) opens the native dialog; choosing `/tmp/sample.md` renders it.
- [ ] After opening a file, File → Open Recent lists it; opening a second file puts it at the top (most-recent-first).
- [ ] Quit and relaunch (`npm run tauri dev` again): the recent list is still populated (persisted).
- [ ] File → Open Recent → Clear Recent empties the list (submenu shows disabled "No Recent Files").
- [ ] Opening `/tmp/xss.md` renders text but the window title stays "Groot — Markdown Viewer" (script stripped — regression check).

- [ ] **Step 3: Commit any final tweaks (if the smoke test surfaced fixes)**

```bash
git add -A
git commit -m "fix: address File menu smoke-test findings" --allow-empty
```
