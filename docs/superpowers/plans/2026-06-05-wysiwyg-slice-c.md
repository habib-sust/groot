# WYSIWYG Slice C (Save / Dirty / New / Close-guard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make editing persistent: Save / Save As / New, a dirty title marker, a close-guard prompt, and live-reload that preserves unsaved edits.

**Architecture:** New Rust `fileops` commands (`write_file`, `save_file_as`) + helpers (`set_window_title`, `close_main_window`); File menu gains New/Save/Save As; the window `CloseRequested` is intercepted in Rust and decided in the frontend. The frontend tracks dirty via Crepe's `markdownUpdated`, owns the title, and shows an in-webview Save/Don't Save/Cancel modal.

**Tech Stack:** Tauri v2, `tauri-plugin-dialog`, Milkdown Crepe, Vite, vanilla JS/CSS.

## ⚠️ Notes
- Use `~/.cargo/bin/cargo`. Branch `feat/wysiwyg-editor` (don't switch). `npm run build` is the JS build check.
- Version-sensitive: `tauri-plugin-dialog` `blocking_save_file()` / `set_file_name` / `FilePath::into_path`; Crepe `getMarkdown()` and `crepe.on((l)=>l.markdownUpdated(...))`; `WindowEvent::CloseRequested { api, .. }` + `api.prevent_close()`. Verify against installed versions; preserve behavior.

## File Structure
- New: `src-tauri/src/fileops.rs` (`write_file` +test, `save_file_as`).
- Modify: `src-tauri/src/lib.rs` (register cmds + `set_window_title`/`close_main_window` + CloseRequested), `src-tauri/src/menu.rs` (File New/Save/Save As; drop title-set in `open_path`), `src/main.js`, `src/index.html` (modal), `src/styles.css` (modal).

---

## Task 1: Rust fileops + helpers + close event

**Files:**
- Create: `src-tauri/src/fileops.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/fileops.rs`**

```rust
use tauri_plugin_dialog::DialogExt;

/// Write text to a path (Save to a known file).
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Failed to write {path}: {e}"))
}

/// Save-As: open a native save dialog, write the content to the chosen path, and
/// return that path (None if cancelled).
#[tauri::command]
pub fn save_file_as(app: tauri::AppHandle, content: String, suggested_name: String) -> Option<String> {
    let chosen = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown"])
        .set_file_name(&suggested_name)
        .blocking_save_file()?;
    let path = chosen.into_path().ok()?;
    std::fs::write(&path, content).ok()?;
    Some(path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_file_roundtrips() {
        let mut p = std::env::temp_dir();
        p.push("groot_writefile_test.md");
        let path = p.to_string_lossy().to_string();
        write_file(path.clone(), "# Saved\n".to_string()).unwrap();
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "# Saved\n");
        let _ = std::fs::remove_file(&p);
    }
}
```

- [ ] **Step 2: lib.rs — module, helper commands, registration**

(a) Add `mod fileops;` near the other `mod` lines.
(b) Add two helper commands (above `run`):
```rust
#[tauri::command]
fn set_window_title(app: tauri::AppHandle, title: String) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_title(&title);
    }
}

#[tauri::command]
fn close_main_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.destroy();
    }
}
```
(c) Register all four in `generate_handler!`:
```rust
        .invoke_handler(tauri::generate_handler![
            markdown::parse_markdown,
            markdown::read_markdown_file,
            markdown::syntax_css,
            get_appearance,
            export::export_html,
            fileops::write_file,
            fileops::save_file_as,
            set_window_title,
            close_main_window
        ])
```

- [ ] **Step 3: lib.rs — intercept window close**

Replace the existing `window.on_window_event(move |event| { if let WindowEvent::DragDrop(...) {...} });` block with a `match` handling both drag-drop and close:
```rust
            let win_handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| match event {
                    tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
                        let md = paths.iter().find(|p| {
                            matches!(
                                p.extension()
                                    .and_then(|e| e.to_str())
                                    .map(|e| e.to_ascii_lowercase())
                                    .as_deref(),
                                Some("md") | Some("markdown")
                            )
                        });
                        match md {
                            Some(path) => menu::open_path(&win_handle, path.clone()),
                            None => {
                                let _ = win_handle
                                    .emit("open-error", "No markdown file in the drop".to_string());
                            }
                        }
                    }
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = win_handle.emit("close-requested", ());
                    }
                    _ => {}
                });
            }
```
(`Emitter` is already imported in lib.rs. The closure now owns `win_handle`.)

- [ ] **Step 4: Build + test**

Run: `~/.cargo/bin/cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -30` → clean (fix dialog `blocking_save_file`/`into_path` API per the ⚠️ note if needed).
Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6` → 24 pass (23 + `write_file_roundtrips`).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/fileops.rs src-tauri/src/lib.rs
git commit -m "feat: add write_file/save_file_as + window-title/close helpers + close intercept"
```

---

## Task 2: File menu — New / Save / Save As; frontend-owned title

**Files:**
- Modify: `src-tauri/src/menu.rs`

- [ ] **Step 1: Add the File items**

Build New/Save/Save As items and update the File submenu chain. Replace the current
`let file_menu = SubmenuBuilder::new(app, "File") … .build()?;` block with:
```rust
    let new_item = MenuItemBuilder::new("New")
        .id("new_file")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let save_item = MenuItemBuilder::new("Save")
        .id("save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let save_as_item = MenuItemBuilder::new("Save As…")
        .id("save_as")
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_item)
        .item(&open_file)
        .item(&recent_submenu)
        .separator()
        .item(&save_item)
        .item(&save_as_item)
        .separator()
        .item(&export_html_item)
        .item(&print_item)
        .build()?;
```

- [ ] **Step 2: Handle the events**

In `handle_menu_event`, add (e.g. after the `"open_file"` arm):
```rust
        "new_file" => {
            let _ = app.emit("new-file", ());
        }
        "save" => {
            let _ = app.emit("save", ());
        }
        "save_as" => {
            let _ = app.emit("save-as", ());
        }
```

- [ ] **Step 3: Remove the title-set from `open_path` (frontend owns the title now)**

In `open_path`, delete the block:
```rust
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_title(name);
        }
    }
```
(Keep the rest of `open_path`: watcher, recent add, persist_and_refresh, emit open-file.)

- [ ] **Step 4: Build + test**

Run: `~/.cargo/bin/cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -15` → clean.
Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6` → 24 pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/menu.rs
git commit -m "feat: File New/Save/Save As menu items; frontend owns window title"
```

---

## Task 3: Frontend — save/dirty/new/close flows + modal

**Files:**
- Modify: `src/main.js`, `src/index.html`, `src/styles.css`

- [ ] **Step 1: Modal markup (`index.html`)**

Add before the `<script type="module" …>` line:
```html
    <div id="unsaved-modal" hidden>
      <div class="modal-card">
        <p id="unsaved-msg">You have unsaved changes.</p>
        <div class="modal-buttons">
          <button id="unsaved-save" type="button">Save</button>
          <button id="unsaved-discard" type="button">Don't Save</button>
          <button id="unsaved-cancel" type="button">Cancel</button>
        </div>
      </div>
    </div>
```

- [ ] **Step 2: Modal styles (`styles.css`)**

Append:
```css
#unsaved-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
}

#unsaved-modal[hidden] {
  display: none;
}

#unsaved-modal .modal-card {
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px 22px;
  max-width: 360px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
}

#unsaved-modal .modal-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}

#unsaved-modal button {
  font: inherit;
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--code-bg);
  color: var(--fg);
  cursor: pointer;
}

#unsaved-modal button:hover {
  border-color: var(--link);
}
```

- [ ] **Step 3: State + helpers (`main.js`)**

(a) Add `let dirty = false;` next to `let crepe = null;`.
(b) Add helpers (e.g. after `showError`):
```js
function basename(p) {
  return p.split("/").pop();
}

function updateTitle() {
  const name = currentPath ? basename(currentPath) : "Untitled";
  const title = (dirty ? "• " : "") + name;
  invoke("set_window_title", { title });
}

// Resolves "save" | "discard" | "cancel" from the in-webview modal.
function confirmUnsaved() {
  return new Promise((resolve) => {
    const modal = document.querySelector("#unsaved-modal");
    const cleanup = () => {
      modal.hidden = true;
      saveBtn.removeEventListener("click", onSave);
      discardBtn.removeEventListener("click", onDiscard);
      cancelBtn.removeEventListener("click", onCancel);
    };
    const saveBtn = document.querySelector("#unsaved-save");
    const discardBtn = document.querySelector("#unsaved-discard");
    const cancelBtn = document.querySelector("#unsaved-cancel");
    const onSave = () => { cleanup(); resolve("save"); };
    const onDiscard = () => { cleanup(); resolve("discard"); };
    const onCancel = () => { cleanup(); resolve("cancel"); };
    saveBtn.addEventListener("click", onSave);
    discardBtn.addEventListener("click", onDiscard);
    cancelBtn.addEventListener("click", onCancel);
    modal.hidden = false;
    saveBtn.focus();
  });
}
```

- [ ] **Step 4: Dirty tracking in `render` (`main.js`)**

Update `render` to register the change listener after create and reset dirty:
```js
async function render(markdown) {
  currentSource = markdown;
  try {
    if (crepe) {
      await crepe.destroy();
      crepe = null;
    }
    viewport.innerHTML = "";
    crepe = new Crepe({ root: viewport, defaultValue: markdown });
    await crepe.create();
    crepe.on((listener) =>
      listener.markdownUpdated(() => {
        dirty = true;
        updateTitle();
      })
    );
    dirty = false;
  } catch (e) {
    crepe = null;
    showError(String(e));
  }
}
```
(If `crepe.on` must be called before `create()` in the installed version, call it
right after `new Crepe(...)`; the `dirty = false;` after `create()` still ensures the
initial load doesn't count as an edit.)

- [ ] **Step 5: Save / Save As / New + title on open (`main.js`)**

(a) In `openPath`, after `await render(content);` add `updateTitle();`.
(b) Append the flows + listeners at the END of `main.js`:
```js
// ---- Save / New / Close ----
async function save() {
  if (!crepe) return;
  if (!currentPath) return saveAs();
  try {
    await invoke("write_file", { path: currentPath, content: crepe.getMarkdown() });
    dirty = false;
    updateTitle();
  } catch (e) {
    showError(String(e));
  }
}

async function saveAs() {
  if (!crepe) return;
  try {
    const suggested = currentPath ? basename(currentPath) : "untitled.md";
    const path = await invoke("save_file_as", {
      content: crepe.getMarkdown(),
      suggestedName: suggested,
    });
    if (path) {
      currentPath = path;
      dirty = false;
      updateTitle();
    }
  } catch (e) {
    showError(String(e));
  }
}

async function newFile() {
  if (dirty) {
    const choice = await confirmUnsaved();
    if (choice === "cancel") return;
    if (choice === "save") await save();
  }
  currentPath = null;
  await render("");
  updateTitle();
}

async function onCloseRequested() {
  if (!dirty) {
    invoke("close_main_window");
    return;
  }
  const choice = await confirmUnsaved();
  if (choice === "cancel") return;
  if (choice === "save") await save();
  invoke("close_main_window");
}

listen("save", () => save());
listen("save-as", () => saveAs());
listen("new-file", () => newFile());
listen("close-requested", () => onCloseRequested());
```

- [ ] **Step 6: Guard live-reload while dirty (`main.js`)**

In `reloadInPlace`, add as the first statement:
```js
async function reloadInPlace(path) {
  if (dirty) return;
  // ...existing reload body...
}
```

- [ ] **Step 7: Verify**

Run: `node --check src/main.js` (passes; type:module) and `npm run build 2>&1 | tail -8` → clean.
Run: `node -e "const fs=require('fs');const c=fs.readFileSync('src/styles.css','utf8');const o=(c.match(/{/g)||[]).length,cl=(c.match(/}/g)||[]).length;if(o!==cl){console.error('brace mismatch');process.exit(1)}console.log('css ok',o)"` → balanced.

- [ ] **Step 8: Commit**

```bash
git add src/main.js src/index.html src/styles.css
git commit -m "feat: save/save-as/new + dirty title + unsaved modal + close guard"
```

---

## Task 4: Verification

**Files:** none (verification only)

- [ ] **Step 1: Headless**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6` → 24 pass.
Run: `npm run build 2>&1 | tail -6` → clean.

- [ ] **Step 2: GUI smoke test (run by the human, or driven via the verify skill)**

Run `npm run tauri dev`. Then:
- [ ] Open a `.md` (Open Recent / drag-drop) → title shows the filename. Type → title shows `• filename`.
- [ ] **⌘S** → title's `•` clears; verify on disk the file now contains your edit
  (`cat` it in a terminal).
- [ ] On the launch sample (no file), **⌘S / ⌘⇧S** → a save dialog appears; saving sets
  the title to the new filename and writes the file.
- [ ] **⌘N** while dirty → the unsaved modal appears (Save / Don't Save / Cancel) and
  behaves; choosing through it starts a blank "Untitled" doc.
- [ ] **Close the window** (⌘W/red button) while dirty → the modal appears; Cancel
  keeps it open, Don't Save closes, Save writes then closes.
- [ ] Edit (dirty), then change the file externally (`echo >> file`) → the editor does
  NOT reload (edits preserved). With no unsaved edits, an external change reloads.

- [ ] **Step 3: Commit any tweaks**

```bash
git add -A
git commit -m "test: verify WYSIWYG slice C (save/dirty/new/close)" --allow-empty
```
