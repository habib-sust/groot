# Export to HTML + Print/PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** File → Export as HTML… (self-contained light .html via save dialog) and File → Print… (⌘P, native panel → Save as PDF), both always light/neutral.

**Architecture:** Menu items emit `export-html` / `print`. The frontend builds the standalone HTML (fetched CSS + light syntax CSS + copy-button-stripped body) and calls a Rust `export_html` command (`wrap_html` + save dialog + write). Print uses `window.print()` with a `@media print` stylesheet + a light-syntax print style.

**Tech Stack:** Rust (Tauri v2 menu/dialog), vanilla JS/CSS.

## ⚠️ Note
- Use `~/.cargo/bin/cargo` (cargo is NOT on the default Bash PATH).
- The `tauri-plugin-dialog` save API is version-sensitive (we already use `pick_file`/`into_path`). The `save_file(callback)` + `set_file_name` + `add_filter` calls below target the installed 2.x; if they differ, verify against `cargo doc -p tauri-plugin-dialog` and adjust, preserving behavior.

## File Structure
- `src-tauri/src/menu.rs` — File→Export/Print items + emit arms.
- `src-tauri/src/export.rs` — **new:** `wrap_html` (+test) + `export_html` command.
- `src-tauri/src/lib.rs` — `mod export`; register `export_html`.
- `src/main.js` — track `currentPath`; `print`/`export-html` listeners; `injectPrintSyntax`.
- `src/styles.css` — `@media print` block.

---

## Task 1: Rust — menu items + export module (with `wrap_html` TDD)

**Files:**
- Create: `src-tauri/src/export.rs`
- Modify: `src-tauri/src/menu.rs`, `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/export.rs` with the impl + a failing-first test**

```rust
use tauri_plugin_dialog::DialogExt;

/// Wrap rendered body HTML + CSS into a standalone, light HTML document.
/// No `data-theme` attribute, so the light `:root` palette applies.
pub fn wrap_html(css: &str, body: &str) -> String {
    format!(
        "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\" />\n\
<style>\n{css}\n</style>\n</head>\n<body class=\"markdown-body\">\n{body}\n</body>\n</html>\n"
    )
}

/// Build a standalone HTML document and save it via a native save dialog.
#[tauri::command]
pub fn export_html(app: tauri::AppHandle, body: String, css: String, name: String) {
    let doc = wrap_html(&css, &body);
    app.dialog()
        .file()
        .add_filter("HTML", &["html"])
        .set_file_name(&name)
        .save_file(move |path| {
            if let Some(fp) = path {
                if let Ok(p) = fp.into_path() {
                    let _ = std::fs::write(p, doc);
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrap_html_is_standalone_and_light() {
        let out = wrap_html(".stx-keyword{color:#b5841f}", "<h1>Hi</h1>");
        assert!(out.contains("<!doctype html>"), "got: {out}");
        assert!(out.contains(".stx-keyword{color:#b5841f}"));
        assert!(out.contains("<h1>Hi</h1>"));
        assert!(out.contains("class=\"markdown-body\""));
        assert!(!out.contains("data-theme"));
    }
}
```

- [ ] **Step 2: Register the module + command in `lib.rs`**

(a) Add `mod export;` near the other `mod` lines.
(b) Add `export::export_html` to the `generate_handler!` list:
```rust
        .invoke_handler(tauri::generate_handler![
            markdown::parse_markdown,
            markdown::read_markdown_file,
            markdown::syntax_css,
            get_appearance,
            export::export_html
        ])
```

- [ ] **Step 3: Add the File menu items (`menu.rs`)**

The File submenu is currently:
```rust
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&open_file)
        .item(&recent_submenu)
        .build()?;
```
Replace it with:
```rust
    let export_html_item = MenuItemBuilder::new("Export as HTML…")
        .id("export_html")
        .build(app)?;
    let print_item = MenuItemBuilder::new("Print…")
        .id("print")
        .accelerator("CmdOrCtrl+P")
        .build(app)?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&open_file)
        .item(&recent_submenu)
        .separator()
        .item(&export_html_item)
        .item(&print_item)
        .build()?;
```

- [ ] **Step 4: Handle the events (`menu.rs`)**

In `handle_menu_event`, add these arms (before the catch-all `path =>`):
```rust
        "export_html" => {
            let _ = app.emit("export-html", ());
        }
        "print" => {
            let _ = app.emit("print", ());
        }
```

- [ ] **Step 5: Build + test**

Run: `~/.cargo/bin/cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -30` → clean (fix the dialog `save_file`/`set_file_name` API per the ⚠️ note if needed).
Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6` → 23 pass (22 + `wrap_html_is_standalone_and_light`).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/export.rs src-tauri/src/menu.rs src-tauri/src/lib.rs
git commit -m "feat: add File > Export as HTML and Print menu + export command"
```

---

## Task 2: Frontend — export build, print, print CSS

**Files:**
- Modify: `src/main.js`, `src/styles.css`

- [ ] **Step 1: Track the current path (`main.js`)**

Add a module-level `let currentPath = null;` right after `const viewport = …`. Then in
`openPath`, set it as the first statement:
```js
async function openPath(path) {
  currentPath = path;
  try {
    const content = await invoke("read_markdown_file", { path });
    await render(content);
  } catch (e) {
    showError(String(e));
  }
}
```

- [ ] **Step 2: Add export + print + print-syntax (`main.js`)**

Append at the END of `src/main.js`:
```js
// ---- Export / Print ----
async function injectPrintSyntax() {
  try {
    const css = await invoke("syntax_css", { theme: "light" });
    const style = document.createElement("style");
    style.id = "syntax-print";
    style.textContent = `@media print {\n${css}\n}`;
    document.head.appendChild(style);
  } catch {
    // non-critical
  }
}

async function exportHtml() {
  try {
    const baseCss = await (await fetch("styles.css")).text();
    const codeCss = await invoke("syntax_css", { theme: "light" });
    const css = `${baseCss}\n${codeCss}`;
    const clone = viewport.cloneNode(true);
    clone.querySelectorAll(".copy-btn").forEach((b) => b.remove());
    const body = clone.innerHTML;
    let name = "untitled.html";
    if (currentPath) {
      const base = currentPath.split("/").pop();
      name = `${base.replace(/\.md$/i, "")}.html`;
    }
    await invoke("export_html", { body, css, name });
  } catch (e) {
    showError(String(e));
  }
}

listen("print", () => window.print());
listen("export-html", () => exportHtml());
```

(Do NOT call `injectPrintSyntax()` here — it must run AFTER `applyTheme` creates
`#syntax-theme`, so the print style is later in source order and wins the print
cascade. That call is added to `DOMContentLoaded` in the next step.)

- [ ] **Step 2b: Call `injectPrintSyntax` after `applyTheme` in the `DOMContentLoaded` handler (`main.js`)**

The existing handler ends like:
```js
  await applyTheme(choice);
  render(SAMPLE);
});
```
Change it to:
```js
  await applyTheme(choice);
  await injectPrintSyntax();
  render(SAMPLE);
});
```
(`#syntax-theme` is created by `applyTheme` and only has its text updated in place on
later theme changes, so `#syntax-print` appended right after stays later in source
order — its `@media print` light rules override the screen colors when printing.)

- [ ] **Step 3: Add the `@media print` block to `src/styles.css`**

Append at the END of `src/styles.css`:
```css
@media print {
  :root {
    --bg: #ffffff;
    --fg: #24292f;
    --heading: #1f2328;
    --muted: #57606a;
    --border: #d0d7de;
    --rule: #d8dee4;
    --code-bg: #f6f8fa;
    --inline-code-bg: #eef1f3;
    --link: #2f4fd0;
  }

  body {
    display: block;
  }

  #outline,
  #find-bar,
  .copy-btn {
    display: none !important;
  }

  #viewport {
    height: auto;
    overflow: visible;
    max-width: 100%;
    margin: 0;
    padding: 0;
  }
}
```

- [ ] **Step 4: Verify**

Run: `node --check src/main.js` → no output.
Run: `node -e "const fs=require('fs');const c=fs.readFileSync('src/styles.css','utf8');const o=(c.match(/{/g)||[]).length,cl=(c.match(/}/g)||[]).length;if(o!==cl){console.error('brace mismatch',o,cl);process.exit(1)}if(!c.includes('@media print')){console.error('missing @media print');process.exit(1)}console.log('css ok, braces',o)"` → `css ok, braces <n>`.

- [ ] **Step 5: Commit**

```bash
git add src/main.js src/styles.css
git commit -m "feat: export HTML + print (window.print) with print stylesheet"
```

---

## Task 3: Verification

**Files:** none (verification only)

- [ ] **Step 1: Headless**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6` → 23 pass.
Run: `~/.cargo/bin/cargo clippy --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10` → no new warnings.
Run: `node --check src/main.js` → clean.

- [ ] **Step 2: GUI smoke test (run by the human, or driven via the verify skill)**

Run `npm run tauri dev`, open a doc with headings + a code block. Then:
- [ ] **File → Export as HTML…** → a save dialog appears with a suggested `<name>.html`. Save it, then open the `.html` in a browser → it renders the document with light styling and **light** code colors (even if the app was in **dark** mode), and has no outline/find/copy chrome.
- [ ] **File → Print…** (⌘P) → the macOS print panel opens; the preview is light/neutral, code is light-colored, and the outline/find bar/copy buttons are absent. "Save as PDF" produces a clean PDF.
- [ ] Export with the launch sample (no file open) → suggested name `untitled.html`; still exports.
- [ ] Cancelling the save dialog leaves no file and no error.

- [ ] **Step 3: Commit any tweaks**

```bash
git add -A
git commit -m "test: verify export + print" --allow-empty
```
