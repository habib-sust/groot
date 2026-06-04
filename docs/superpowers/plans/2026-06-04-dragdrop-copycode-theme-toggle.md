# Drag-and-Drop + Copy-Code + Theme Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag-and-drop open, a per-block copy-code button, and a native View → Appearance (Light/Dark/System) theme toggle that overrides the OS.

**Architecture:** Drag-drop is handled in Rust and reuses a shared `open_path`. Appearance is persisted in Rust; the native menu emits `appearance-changed`; the frontend sets a `data-theme` attribute and re-injects the matching `syntax_css(theme)`. CSS moves from `@media` to a `:root[data-theme="dark"]` selector. Copy buttons are added in the frontend after each render.

**Tech Stack:** Rust, Tauri v2 (menu, window events), syntect, vanilla JS/CSS.

## ⚠️ Notes
- Use `~/.cargo/bin/cargo` (cargo is NOT on the default Bash PATH).
- The Tauri v2 drag-drop event enum (`WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. })`) and `CheckMenuItemBuilder` API are version-sensitive (tauri 2.11.2). If a call doesn't compile, verify against `cargo doc -p tauri` / docs and adjust, preserving behavior.

## File Structure
- New: `src-tauri/src/appearance.rs` — `Appearance` enum + persistence.
- `src-tauri/src/markdown.rs` — `syntax_css(theme)` param.
- `src-tauri/src/menu.rs` — shared `open_path`; View→Appearance submenu; appearance-aware `build_app_menu` + `persist_and_refresh`; appearance menu handlers.
- `src-tauri/src/lib.rs` — `mod appearance`; manage `Mutex<Appearance>`; `appearance_store_path`; `get_appearance` command; drag-drop wiring; register command.
- `src/main.js` — appearance resolve/apply + copy buttons.
- `src/styles.css` — `data-theme` refactor + `.copy-btn`.

---

## Task 1: `Appearance` store (TDD)

**Files:**
- Create: `src-tauri/src/appearance.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod appearance;`)

- [ ] **Step 1: Create `src-tauri/src/appearance.rs`**

```rust
use std::path::Path;

/// User's appearance choice. Persisted as a plain string.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Appearance {
    Light,
    Dark,
    #[default]
    System,
}

impl Appearance {
    pub fn as_str(self) -> &'static str {
        match self {
            Appearance::Light => "light",
            Appearance::Dark => "dark",
            Appearance::System => "system",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s.trim() {
            "light" => Appearance::Light,
            "dark" => Appearance::Dark,
            _ => Appearance::System,
        }
    }

    /// Load from a file; missing/unknown → System.
    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .map(|s| Appearance::parse(&s))
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        std::fs::write(path, self.as_str()).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_roundtrip_and_unknown() {
        assert_eq!(Appearance::parse("light"), Appearance::Light);
        assert_eq!(Appearance::parse("dark"), Appearance::Dark);
        assert_eq!(Appearance::parse("system"), Appearance::System);
        assert_eq!(Appearance::parse("bogus"), Appearance::System);
        assert_eq!(Appearance::Dark.as_str(), "dark");
    }

    #[test]
    fn save_then_load() {
        let mut path = std::env::temp_dir();
        path.push("groot_appearance_test.txt");
        Appearance::Dark.save(&path).unwrap();
        assert_eq!(Appearance::load(&path), Appearance::Dark);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn load_missing_is_system() {
        assert_eq!(
            Appearance::load(Path::new("/no/such/groot_appearance.txt")),
            Appearance::System
        );
    }
}
```

- [ ] **Step 2: Register the module**

In `src-tauri/src/lib.rs`, add near the other `mod` lines: `mod appearance;`

- [ ] **Step 3: Run tests**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml appearance 2>&1 | tail -15`
Expected: `test result: ok. 3 passed`. (A `dead_code` warning for as-yet-unused methods is expected — leave it.)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/appearance.rs src-tauri/src/lib.rs
git commit -m "feat: add Appearance enum with persistence"
```

---

## Task 2: `syntax_css(theme)` (TDD)

**Files:**
- Modify: `src-tauri/src/markdown.rs`

- [ ] **Step 1: Replace the three syntax_css tests**

In `src-tauri/src/markdown.rs`'s `mod tests`, DELETE `syntax_css_uses_warm_theme`, `syntax_css_has_dark_media`, and `syntax_css_dark_uses_warm_dark`. ADD:

```rust
    #[test]
    fn syntax_css_light_is_warm() {
        let css = syntax_css("light".to_string()).to_lowercase();
        assert!(css.contains("b06a7a"), "light should use warm rose, got: {css}");
        assert!(!css.contains("prefers-color-scheme"), "no media wrapper");
    }

    #[test]
    fn syntax_css_dark_is_warm_dark() {
        let css = syntax_css("dark".to_string()).to_lowercase();
        assert!(css.contains("d98c9a"), "dark should use warm-dark rose, got: {css}");
        assert!(!css.contains("prefers-color-scheme"), "no media wrapper");
    }

    #[test]
    fn syntax_css_unknown_defaults_to_light() {
        let css = syntax_css("bogus".to_string()).to_lowercase();
        assert!(css.contains("b06a7a"), "unknown theme should default to light");
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml markdown 2>&1 | tail -20`
Expected: compile error — `syntax_css` currently takes no argument.

- [ ] **Step 3: Change `syntax_css` signature**

Replace the entire `syntax_css` function with:

```rust
/// CSS for syntax highlighting for the given theme ("light" or "dark"), as
/// class rules with no media wrapper. The frontend injects the matching one
/// based on the active appearance. Class names match `parse_markdown`'s prefix.
#[tauri::command]
pub fn syntax_css(theme: String) -> String {
    let selected = if theme == "dark" { dark_theme() } else { theme() };
    css_for_theme_with_class_style(selected, CLASS_STYLE).unwrap_or_default()
}
```

- [ ] **Step 4: Run tests**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml markdown 2>&1 | tail -10`
Expected: markdown tests pass (the 3 new ones + the unchanged 7 = 10).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/markdown.rs
git commit -m "feat: syntax_css takes a theme argument (no media wrapper)"
```

---

## Task 3: Shared `open_path` + drag-and-drop

**Files:**
- Modify: `src-tauri/src/menu.rs`, `src-tauri/src/lib.rs`

- [ ] **Step 1: Rename `on_file_chosen` to a public `open_path`**

In `src-tauri/src/menu.rs`, rename the function `fn on_file_chosen<R: Runtime>(...)` to `pub fn open_path<R: Runtime>(...)` (signature otherwise identical). Update its two call sites in `handle_menu_event` (`on_file_chosen(&app, path)` → `open_path(&app, path)` and `on_file_chosen(app, path_buf)` → `open_path(app, path_buf)`). The doc comment can stay/become: `/// Open a file: set title, add to recents, persist, rebuild menu, emit open-file.`

- [ ] **Step 2: Wire drag-drop in `lib.rs` setup**

In `src-tauri/src/lib.rs`, add `use tauri::Emitter;` to the imports (next to `use tauri::Manager;`). Then, inside the `.setup(|app| { … })` closure, AFTER `app.manage(Mutex::new(recent));` and before `Ok(())`, add:

```rust
            let drag_handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) =
                        event
                    {
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
                            Some(path) => menu::open_path(&drag_handle, path.clone()),
                            None => {
                                let _ = drag_handle
                                    .emit("open-error", "No markdown file in the drop".to_string());
                            }
                        }
                    }
                });
            }
```

If the `DragDrop`/`DragDropEvent` path doesn't compile, check the installed tauri's event enum (e.g. it may be `tauri::DragDropEvent` re-exported differently) and adjust to the correct path, keeping the "first .md, else error" behavior.

- [ ] **Step 3: Build + test**

Run: `~/.cargo/bin/cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -30` → clean (fix the drag-drop enum path per the ⚠️ note if needed).
Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6` → all pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/menu.rs src-tauri/src/lib.rs
git commit -m "feat: drag-and-drop opens the first dropped markdown file"
```

---

## Task 4: View → Appearance menu + state + `get_appearance`

**Files:**
- Modify: `src-tauri/src/menu.rs`, `src-tauri/src/lib.rs`

- [ ] **Step 1: Make `build_app_menu` appearance-aware (`menu.rs`)**

At the top of `menu.rs`, add imports: change the menu import line to include `CheckMenuItemBuilder`, and add the appearance import:
```rust
use tauri::menu::{
    CheckMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
```
and below the existing `use crate::recent_files::RecentFiles;` add:
```rust
use crate::appearance::Appearance;
```

Change the `build_app_menu` signature to take the appearance and add a View submenu. Replace the signature line and the final `MenuBuilder` chain:

Signature:
```rust
pub fn build_app_menu<R: Runtime>(
    app: &AppHandle<R>,
    recent: &RecentFiles,
    appearance: Appearance,
) -> tauri::Result<Menu<R>> {
```

Just before the final `MenuBuilder::new(app)…` chain, add:
```rust
    let appearance_menu = SubmenuBuilder::new(app, "Appearance")
        .item(
            &CheckMenuItemBuilder::new("Light")
                .id("appearance_light")
                .checked(appearance == Appearance::Light)
                .build(app)?,
        )
        .item(
            &CheckMenuItemBuilder::new("Dark")
                .id("appearance_dark")
                .checked(appearance == Appearance::Dark)
                .build(app)?,
        )
        .item(
            &CheckMenuItemBuilder::new("System")
                .id("appearance_system")
                .checked(appearance == Appearance::System)
                .build(app)?,
        )
        .build()?;
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&appearance_menu)
        .build()?;
```

And change the final chain to include View (after Edit, before File):
```rust
    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&file_menu)
        .build()
```

- [ ] **Step 2: Handle the appearance menu items (`menu.rs`)**

In `handle_menu_event`, add this arm (before the catch-all `path =>` arm):
```rust
        "appearance_light" | "appearance_dark" | "appearance_system" => {
            let choice = match id {
                "appearance_light" => Appearance::Light,
                "appearance_dark" => Appearance::Dark,
                _ => Appearance::System,
            };
            {
                let state = app.state::<Mutex<Appearance>>();
                *state.lock().unwrap() = choice;
                let _ = choice.save(&crate::appearance_store_path(app));
            }
            persist_and_refresh(app);
            let _ = app.emit("appearance-changed", choice.as_str().to_string());
        }
```

- [ ] **Step 3: Make `persist_and_refresh` rebuild with appearance (`menu.rs`)**

Replace the body of `persist_and_refresh` with (reads both recent + appearance from state when rebuilding):
```rust
fn persist_and_refresh<R: Runtime>(app: &AppHandle<R>) {
    let store_path = crate::recent_store_path(app);
    {
        let state = app.state::<Mutex<RecentFiles>>();
        let guard = state.lock().unwrap();
        let _ = guard.save(&store_path);
    }

    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        let appearance = *app.state::<Mutex<Appearance>>().lock().unwrap();
        let recent_state = app.state::<Mutex<RecentFiles>>();
        let recent = recent_state.lock().unwrap();
        if let Ok(menu) = build_app_menu(&app, &recent, appearance) {
            let _ = app.set_menu(menu);
        }
    });
}
```

- [ ] **Step 4: Wire state, path, and command in `lib.rs`**

(a) Add `use appearance::Appearance;` next to `use recent_files::RecentFiles;`.

(b) Add the appearance store path helper next to `recent_store_path`:
```rust
/// Path to the persisted appearance choice, inside the app config dir.
pub(crate) fn appearance_store_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> std::path::PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .expect("failed to resolve app config dir");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("appearance.txt")
}
```

(c) Add the command (above `run`):
```rust
#[tauri::command]
fn get_appearance(state: tauri::State<Mutex<Appearance>>) -> String {
    state.lock().unwrap().as_str().to_string()
}
```

(d) Register it in the handler:
```rust
        .invoke_handler(tauri::generate_handler![
            markdown::parse_markdown,
            markdown::read_markdown_file,
            markdown::syntax_css,
            get_appearance
        ])
```

(e) In `.setup`, load appearance, build the menu with it, and manage it. Replace the menu-build + manage lines so the closure reads:
```rust
        .setup(|app| {
            let handle = app.handle();
            let store_path = recent_store_path(handle);
            let mut recent = RecentFiles::load(&store_path);
            recent.prune_with(|p| p.exists());
            let _ = recent.save(&store_path);

            let appearance = Appearance::load(&appearance_store_path(handle));
            let menu = menu::build_app_menu(handle, &recent, appearance)?;
            app.set_menu(menu)?;
            app.manage(Mutex::new(recent));
            app.manage(Mutex::new(appearance));

            let drag_handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) =
                        event
                    {
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
                            Some(path) => menu::open_path(&drag_handle, path.clone()),
                            None => {
                                let _ = drag_handle
                                    .emit("open-error", "No markdown file in the drop".to_string());
                            }
                        }
                    }
                });
            }

            Ok(())
        })
```
(This supersedes the drag-drop block added in Task 3 Step 2 — it's the same code, now placed alongside the appearance setup. If Task 3 already added the drag-drop block, keep a single copy.)

- [ ] **Step 5: Build + test**

Run: `~/.cargo/bin/cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -30` → clean. Fix any `CheckMenuItemBuilder` API mismatch per the ⚠️ note.
Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6` → all pass (21 total: 10 markdown + 8 recent_files + 3 appearance).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/menu.rs src-tauri/src/lib.rs
git commit -m "feat: View>Appearance menu (Light/Dark/System) with persistence"
```

---

## Task 5: Frontend — appearance apply + copy buttons + CSS refactor

**Files:**
- Modify: `src/main.js`, `src/styles.css`

- [ ] **Step 1: Replace `src/main.js` entirely**

```js
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const viewport = document.querySelector("#viewport");

const SAMPLE = `# Welcome to Groot

A lightweight **Markdown viewer** built with Tauri + Rust.

- Use the **File** menu → **Open File…** (⌘O), or **drag a \`.md\` file** onto the window.
- Recently opened files appear under **File → Open Recent**.
- Switch themes under **View → Appearance**.
- Rendering is powered by \`pulldown-cmark\`, sanitized with \`ammonia\`.

## Example code

\`\`\`rust
fn main() {
    let greeting = "hello, groot";
    println!("{greeting}");
}
\`\`\`

> Editing is coming in a later iteration.
`;

function showError(message) {
  viewport.innerHTML = `<p class="error">⚠️ ${message}</p>`;
}

function addCopyButtons() {
  for (const pre of viewport.querySelectorAll("pre")) {
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.type = "button";
    btn.textContent = "Copy";
    btn.addEventListener("click", async () => {
      const code = pre.querySelector("code");
      const text = code ? code.innerText : pre.innerText;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "Copied!";
      } catch {
        btn.textContent = "Failed";
      }
      setTimeout(() => {
        btn.textContent = "Copy";
      }, 1500);
    });
    pre.appendChild(btn);
  }
}

async function render(markdown) {
  try {
    viewport.innerHTML = await invoke("parse_markdown", { content: markdown });
    addCopyButtons();
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

// ---- Appearance / theme ----
let darkMql = null;
let onOsChange = null;

function effectiveTheme(choice) {
  if (choice === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return choice === "dark" ? "dark" : "light";
}

async function injectSyntaxCss(theme) {
  try {
    const css = await invoke("syntax_css", { theme });
    let style = document.getElementById("syntax-theme");
    if (!style) {
      style = document.createElement("style");
      style.id = "syntax-theme";
      document.head.appendChild(style);
    }
    style.textContent = css;
  } catch {
    // highlighting CSS is non-critical
  }
}

async function applyTheme(choice) {
  const eff = effectiveTheme(choice);
  document.documentElement.dataset.theme = eff;
  await injectSyntaxCss(eff);

  if (darkMql && onOsChange) {
    darkMql.removeEventListener("change", onOsChange);
    onOsChange = null;
  }
  if (choice === "system") {
    darkMql = window.matchMedia("(prefers-color-scheme: dark)");
    onOsChange = () => applyTheme("system");
    darkMql.addEventListener("change", onOsChange);
  }
}

listen("open-file", (event) => openPath(event.payload));
listen("open-error", (event) => showError(String(event.payload)));
listen("appearance-changed", (event) => applyTheme(String(event.payload)));

window.addEventListener("DOMContentLoaded", async () => {
  let choice = "system";
  try {
    choice = await invoke("get_appearance");
  } catch {
    // default to system
  }
  await applyTheme(choice);
  render(SAMPLE);
});
```

- [ ] **Step 2: Update `src/styles.css`**

(a) Replace the dark theme block. Change:
```css
@media (prefers-color-scheme: dark) {
  :root {
```
to:
```css
:root[data-theme="dark"] {
```
and remove the now-extra closing brace: the block currently ends with `  }\n}` (inner `:root` close + `@media` close). After the change it should be a single `:root[data-theme="dark"] { … }` block — delete the outer `}` that closed the `@media`. (Net: one `{`/`}` pair instead of two.)

(b) Add `position: relative;` to the existing `.markdown-body pre` rule (so the absolutely-positioned button anchors to it). The rule becomes:
```css
.markdown-body pre {
  position: relative;
  background: var(--code-bg);
  padding: 18px 20px;
  border-radius: 8px;
  overflow: auto;
  line-height: 1.5;
}
```

(c) Append these copy-button rules at the end of the file:
```css
.copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  font: inherit;
  font-size: 0.72em;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg);
  color: var(--muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.markdown-body pre:hover .copy-btn,
.copy-btn:focus {
  opacity: 1;
}

.copy-btn:hover {
  color: var(--fg);
  border-color: var(--link);
}
```

- [ ] **Step 3: Verify**

Run: `node --check src/main.js` → no output.
Run: `node -e "const fs=require('fs');const c=fs.readFileSync('src/styles.css','utf8');const o=(c.match(/{/g)||[]).length,cl=(c.match(/}/g)||[]).length;if(o!==cl){console.error('brace mismatch',o,cl);process.exit(1)}if(c.includes('prefers-color-scheme: dark) {')){console.error('still has @media dark wrapper');process.exit(1)}if(!c.includes('[data-theme=\"dark\"]')){console.error('missing data-theme selector');process.exit(1)}console.log('css ok, braces',o)"` → `css ok, braces <n>`.

- [ ] **Step 4: Commit**

```bash
git add src/main.js src/styles.css
git commit -m "feat: theme toggle apply + copy-code buttons (frontend)"
```

---

## Task 6: Verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite + clippy**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -8` → 21 pass.
Run: `~/.cargo/bin/cargo clippy --manifest-path src-tauri/Cargo.toml 2>&1 | tail -15` → no new warnings.

- [ ] **Step 2: GUI smoke test (run by the human)**

Run `npm run tauri dev` and verify:
- [ ] **Drag-and-drop:** drag a `.md` file onto the window → it renders; window title + Open Recent update. Drag a non-md file → a brief error in the viewport.
- [ ] **Copy button:** hover a code block → a Copy button appears top-right; click → clipboard has the code and it flashes "Copied!".
- [ ] **Appearance:** View → Appearance shows Light/Dark/System with the active one checked. Pick Light → warm cream regardless of OS; pick Dark → slate warm-muted regardless of OS; pick System → follows the OS. The page chrome AND code colors switch each time.
- [ ] **Persistence:** set Dark, quit (⌘Q), relaunch → still Dark. Set System, change the macOS appearance while the app is open → it follows live.
- [ ] **Open Recent persistence (requested check):** open a couple files, quit, relaunch → Open Recent still lists them; a deleted file is pruned.
- [ ] **Regression:** ⌘O open works; Edit ⌘A/⌘C work; `/tmp/xss.md` renders text with no script execution.

- [ ] **Step 3: Commit any tweaks**

```bash
git add -A
git commit -m "test: verify drag-drop, copy-code, theme toggle" --allow-empty
```
