# Edit Menu + Recent Auto-Pruning + Syntax Highlighting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Edit menu (Copy/Select All), auto-prune missing "Open Recent" entries, and syntax-highlight fenced code blocks Rust-side via syntect.

**Architecture:** `parse_markdown` becomes event-driven: fenced code blocks are highlighted with syntect's class-based HTML generator, everything else renders via pulldown-cmark; output is sanitized by an ammonia Builder that allows `class` on `span`/`pre`/`code`. A `syntax_css()` command returns light+dark theme CSS the frontend injects once. The native menu gains an Edit submenu; recent files are pruned at startup and on failed open (which emits an `open-error` event).

**Tech Stack:** Rust, Tauri v2, `pulldown-cmark`, `ammonia`, `syntect` (fancy-regex feature), `serde_json`, vanilla JS (`window.__TAURI__`).

---

## ⚠️ Note on the syntect & Tauri APIs (read before Tasks 1 & 3)

syntect and Tauri menu method names are version-sensitive. The code below targets syntect 5.x and tauri 2.11.2. If `cargo build` reports a mismatch, look up the correct call for the installed version (context7 MCP `/tauri-apps/tauri-docs`, or `cargo doc -p syntect --open` / docs.rs) and adjust the call **without changing the described behavior**. Likely spots: `ClassedHTMLGenerator::new_with_class_style`, `parse_html_for_line_which_includes_newline`, `css_for_theme_with_class_style`, `ClassStyle::SpacedPrefixed { prefix }`, pulldown-cmark 0.13 `Event::End(TagEnd::CodeBlock)` / `CodeBlockKind::Fenced(CowStr)`, and `PredefinedMenuItem::copy/select_all`.

---

## File Structure
- `src-tauri/Cargo.toml` — add `syntect` (fancy-regex feature).
- `src-tauri/src/markdown.rs` — rewrite `parse_markdown` (syntect highlighting + ammonia Builder); add `syntax_css()`; new tests.
- `src-tauri/src/recent_files.rs` — add `remove` + `prune_with` + tests.
- `src-tauri/src/menu.rs` — add Edit submenu; failed-open pruning + `open-error` emit.
- `src-tauri/src/lib.rs` — register `syntax_css`; startup pruning.
- `src/main.js` — inject `syntax_css` on startup; listen for `open-error`.

---

## Task 1: Syntax highlighting backend

**Files:**
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/markdown.rs`, `src-tauri/src/lib.rs`

Re-read the ⚠️ note. Use `~/.cargo/bin/cargo` (cargo is NOT on the default Bash PATH).

- [ ] **Step 1: Add the syntect dependency (fancy-regex, no oniguruma/C)**

Run:
```bash
cd src-tauri && ~/.cargo/bin/cargo add syntect --no-default-features --features default-fancy && cd ..
```
Expected: `Cargo.toml` lists `syntect` with `default-features = false` and `features = ["default-fancy"]`. (fancy-regex is pure Rust — avoids needing a C compiler/oniguruma.)

- [ ] **Step 2: Write failing tests in `markdown.rs`**

In `src-tauri/src/markdown.rs`, REPLACE the existing `#[cfg(test)] mod tests { … }` block with this expanded one (keep the existing `renders_heading`, `renders_code_block`, `strips_script_tags`, `read_missing_file_errors`, `reads_existing_file` tests and ADD the new ones):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_heading() {
        let html = parse_markdown("# Hello".to_string()).unwrap();
        assert!(html.contains("<h1>Hello</h1>"), "got: {html}");
    }

    #[test]
    fn renders_code_block() {
        let html = parse_markdown("```\nlet x = 1;\n```".to_string()).unwrap();
        assert!(html.contains("<pre"), "got: {html}");
        assert!(html.contains("<code"), "got: {html}");
    }

    #[test]
    fn strips_script_tags() {
        let html = parse_markdown("<script>alert('x')</script>".to_string()).unwrap();
        assert!(!html.contains("<script>"), "got: {html}");
    }

    #[test]
    fn highlights_known_language_with_spans() {
        let html = parse_markdown("```rust\nfn main() {}\n```".to_string()).unwrap();
        // syntect emits classed spans for recognized languages; ammonia must keep the class attr.
        assert!(html.contains("<span class="), "expected highlighted spans, got: {html}");
    }

    #[test]
    fn unknown_language_does_not_panic_and_keeps_code() {
        let html = parse_markdown("```nosuchlang\nhello world\n```".to_string()).unwrap();
        assert!(html.contains("<pre"), "got: {html}");
        assert!(html.contains("hello world"), "code text should survive, got: {html}");
    }

    #[test]
    fn syntax_css_has_light_and_dark() {
        let css = syntax_css();
        assert!(!css.is_empty(), "css should not be empty");
        assert!(
            css.contains("prefers-color-scheme: dark"),
            "css should contain a dark media block"
        );
    }

    #[test]
    fn read_missing_file_errors() {
        let result = read_markdown_file("/no/such/file-xyz.md".to_string());
        assert!(result.is_err(), "expected Err for missing file");
    }

    #[test]
    fn reads_existing_file() {
        let mut path = std::env::temp_dir();
        path.push("groot_read_test.md");
        std::fs::write(&path, "# Temp\n").unwrap();
        let content = read_markdown_file(path.to_string_lossy().to_string()).unwrap();
        assert_eq!(content, "# Temp\n");
        let _ = std::fs::remove_file(&path);
    }
}
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml markdown 2>&1 | tail -25`
Expected: compile error or failures for `highlights_known_language_with_spans` and `syntax_css_has_light_and_dark` (because `syntax_css` doesn't exist yet and highlighting isn't wired). That confirms the tests target new behavior.

- [ ] **Step 4: Rewrite the top of `markdown.rs` (imports + parse_markdown + helpers + syntax_css)**

Replace everything in `src-tauri/src/markdown.rs` ABOVE the `#[cfg(test)]` line with:

```rust
use std::sync::OnceLock;

use pulldown_cmark::{CodeBlockKind, CowStr, Event, Options, Parser, Tag, TagEnd};
use syntect::highlighting::ThemeSet;
use syntect::html::{css_for_theme_with_class_style, ClassStyle, ClassedHTMLGenerator};
use syntect::parsing::SyntaxSet;
use syntect::util::LinesWithEndings;

/// Class prefix for syntect-generated span classes + matching CSS, to avoid
/// colliding with app CSS classes (e.g. `.error`).
const CLASS_STYLE: ClassStyle = ClassStyle::SpacedPrefixed { prefix: "stx-" };

fn syntax_set() -> &'static SyntaxSet {
    static SS: OnceLock<SyntaxSet> = OnceLock::new();
    SS.get_or_init(SyntaxSet::load_defaults_newlines)
}

fn theme_set() -> &'static ThemeSet {
    static TS: OnceLock<ThemeSet> = OnceLock::new();
    TS.get_or_init(ThemeSet::load_defaults)
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

/// Highlight a fenced code block into `<pre><code>…classed spans…</code></pre>`.
/// Unknown language → plain text syntax. Any syntect error → escaped plain block.
fn highlight_code(lang: &str, code: &str) -> String {
    let ss = syntax_set();
    let syntax = if lang.is_empty() {
        ss.find_syntax_plain_text()
    } else {
        ss.find_syntax_by_token(lang)
            .unwrap_or_else(|| ss.find_syntax_plain_text())
    };
    let mut generator = ClassedHTMLGenerator::new_with_class_style(syntax, ss, CLASS_STYLE);
    for line in LinesWithEndings::from(code) {
        if generator
            .parse_html_for_line_which_includes_newline(line)
            .is_err()
        {
            return format!("<pre><code>{}</code></pre>", escape_html(code));
        }
    }
    format!("<pre><code>{}</code></pre>", generator.finalize())
}

/// Render markdown to sanitized HTML, with syntect-highlighted fenced code blocks.
#[tauri::command]
pub fn parse_markdown(content: String) -> Result<String, String> {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);

    let parser = Parser::new_ext(&content, options);

    // Replace fenced/indented code-block event runs with a single highlighted HTML event.
    let mut events: Vec<Event> = Vec::new();
    let mut in_code = false;
    let mut code_lang = String::new();
    let mut code_buf = String::new();
    for event in parser {
        match event {
            Event::Start(Tag::CodeBlock(kind)) => {
                in_code = true;
                code_buf.clear();
                code_lang = match kind {
                    CodeBlockKind::Fenced(lang) => lang.to_string(),
                    CodeBlockKind::Indented => String::new(),
                };
            }
            Event::End(TagEnd::CodeBlock) => {
                in_code = false;
                let html = highlight_code(code_lang.trim(), &code_buf);
                events.push(Event::Html(CowStr::from(html)));
            }
            Event::Text(text) if in_code => {
                code_buf.push_str(&text);
            }
            other => events.push(other),
        }
    }

    let mut rendered = String::new();
    pulldown_cmark::html::push_html(&mut rendered, events.into_iter());

    // Sanitize, but keep the class attribute syntect needs on span/pre/code.
    let mut builder = ammonia::Builder::default();
    builder.add_tags(["span"]);
    builder.add_tag_attributes("span", ["class"]);
    builder.add_tag_attributes("code", ["class"]);
    builder.add_tag_attributes("pre", ["class"]);
    Ok(builder.clean(&rendered).to_string())
}

/// Reads a UTF-8 markdown file from disk. The caller (frontend) supplies the path,
/// chosen via the OS file dialog; this command will read any readable path it is given.
#[tauri::command]
pub fn read_markdown_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {path}: {e}"))
}

/// CSS for syntax highlighting: a light theme plus a dark theme wrapped in a
/// prefers-color-scheme media query. Class names match the prefix used by
/// `parse_markdown`'s highlighter.
#[tauri::command]
pub fn syntax_css() -> String {
    let ts = theme_set();
    let light = ts
        .themes
        .get("InspiredGitHub")
        .and_then(|t| css_for_theme_with_class_style(t, CLASS_STYLE).ok())
        .unwrap_or_default();
    let dark = ts
        .themes
        .get("base16-ocean.dark")
        .and_then(|t| css_for_theme_with_class_style(t, CLASS_STYLE).ok())
        .unwrap_or_default();
    format!("{light}\n@media (prefers-color-scheme: dark) {{\n{dark}\n}}\n")
}
```

- [ ] **Step 5: Register `syntax_css` in the invoke handler**

In `src-tauri/src/lib.rs`, add `markdown::syntax_css` to the `generate_handler!` list so it reads:
```rust
        .invoke_handler(tauri::generate_handler![
            markdown::parse_markdown,
            markdown::read_markdown_file,
            markdown::syntax_css
        ])
```

- [ ] **Step 6: Build and run tests (fix API mismatches per the ⚠️ note)**

Run: `~/.cargo/bin/cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -40`
Iterate until clean. Then:
Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml markdown 2>&1 | tail -20`
Expected: all markdown tests pass (the 5 prior + `highlights_known_language_with_spans`, `unknown_language_does_not_panic_and_keeps_code`, `syntax_css_has_light_and_dark` = 8). If `highlights_known_language_with_spans` fails because syntect's class style emits a different attribute form, inspect the actual output and correct the assertion to match genuinely-highlighted output — but do NOT weaken the script-stripping test and do NOT remove highlighting.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/markdown.rs src-tauri/src/lib.rs
git commit -m "feat: syntect syntax highlighting in parse_markdown + syntax_css command"
```

---

## Task 2: Recent-files pruning methods (TDD)

**Files:**
- Modify: `src-tauri/src/recent_files.rs`

- [ ] **Step 1: Add failing tests**

In `src-tauri/src/recent_files.rs`, inside the existing `mod tests` block, add:

```rust
    #[test]
    fn remove_deletes_matching_entry() {
        let mut r = RecentFiles::default();
        r.add(PathBuf::from("/a.md"));
        r.add(PathBuf::from("/b.md"));
        r.remove(Path::new("/a.md"));
        assert_eq!(r.list(), &[PathBuf::from("/b.md")]);
    }

    #[test]
    fn prune_with_keeps_only_approved() {
        let mut r = RecentFiles::default();
        r.add(PathBuf::from("/a.md"));
        r.add(PathBuf::from("/b.md"));
        r.add(PathBuf::from("/c.md"));
        let keep = [PathBuf::from("/a.md"), PathBuf::from("/c.md")];
        r.prune_with(|p| keep.contains(p));
        assert_eq!(r.list(), &[PathBuf::from("/c.md"), PathBuf::from("/a.md")]);
    }
```

- [ ] **Step 2: Run tests to verify they fail to compile**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml recent_files 2>&1 | tail -20`
Expected: compile error — `remove` / `prune_with` not found.

- [ ] **Step 3: Implement the two methods**

In `src-tauri/src/recent_files.rs`, inside `impl RecentFiles`, add after `clear`:

```rust
    /// Remove any entry equal to `path`.
    pub fn remove(&mut self, path: &Path) {
        self.items.retain(|p| p.as_path() != path);
    }

    /// Retain only entries for which `keep` returns true (order preserved).
    pub fn prune_with(&mut self, mut keep: impl FnMut(&PathBuf) -> bool) {
        self.items.retain(|p| keep(p));
    }
```

- [ ] **Step 4: Run tests**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml recent_files 2>&1 | tail -20`
Expected: `test result: ok. 8 passed` (6 prior + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/recent_files.rs
git commit -m "feat: add RecentFiles::remove and prune_with"
```

---

## Task 3: Edit menu, startup + failed-open pruning

**Files:**
- Modify: `src-tauri/src/menu.rs`, `src-tauri/src/lib.rs`

Re-read the ⚠️ note (PredefinedMenuItem API).

- [ ] **Step 1: Add the Edit submenu in `build_app_menu`**

In `src-tauri/src/menu.rs`, inside `build_app_menu`, after building `app_menu` and before building `file_menu`, add:

```rust
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;
```

Then add it to the final menu between the app menu and file menu:
```rust
    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&edit_menu)
        .item(&file_menu)
        .build()
```

- [ ] **Step 2: Add failed-open pruning to the recent-item click arm**

In `handle_menu_event`, replace the catch-all `path =>` arm with:

```rust
        path => {
            let path_buf = PathBuf::from(path);
            if path_buf.exists() {
                on_file_chosen(app, path_buf);
            } else {
                {
                    let state = app.state::<Mutex<RecentFiles>>();
                    state.lock().unwrap().remove(&path_buf);
                }
                persist_and_refresh(app);
                let _ = app.emit("open-error", format!("File no longer exists: {path}"));
            }
        }
```

(The `Emitter` trait providing `emit` is already imported in this file; `RecentFiles::remove` was added in Task 2.)

- [ ] **Step 3: Add startup pruning in `lib.rs`**

In `src-tauri/src/lib.rs`, in the `.setup` closure, change the recent-load block so it prunes missing files and persists the cleaned list before building the menu:

```rust
        .setup(|app| {
            let handle = app.handle();
            let store_path = recent_store_path(handle);
            let mut recent = RecentFiles::load(&store_path);
            recent.prune_with(|p| p.exists());
            let _ = recent.save(&store_path);
            let menu = menu::build_app_menu(handle, &recent)?;
            app.set_menu(menu)?;
            app.manage(Mutex::new(recent));
            Ok(())
        })
```

- [ ] **Step 4: Build + test**

Run: `~/.cargo/bin/cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -20`
Expected: clean. Fix any PredefinedMenuItem API mismatch per the ⚠️ note.
Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -8`
Expected: all tests pass (8 markdown + 8 recent_files = 16).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/menu.rs src-tauri/src/lib.rs
git commit -m "feat: add Edit menu and prune missing recent files"
```

---

## Task 4: Frontend — inject theme CSS, handle open-error

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Replace `src/main.js`**

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

// Inject the syntect-generated theme CSS (light + dark) once.
async function injectSyntaxTheme() {
  try {
    const css = await invoke("syntax_css");
    const style = document.createElement("style");
    style.id = "syntax-theme";
    style.textContent = css;
    document.head.appendChild(style);
  } catch (e) {
    // Highlighting CSS is non-critical; ignore failures.
  }
}

// The native File menu (Rust) emits "open-file" with the chosen path.
listen("open-file", (event) => {
  openPath(event.payload);
});

// Rust emits "open-error" when a recent file no longer exists (and was pruned).
listen("open-error", (event) => {
  showError(String(event.payload));
});

window.addEventListener("DOMContentLoaded", async () => {
  await injectSyntaxTheme();
  render(SAMPLE);
});
```

- [ ] **Step 2: Syntax-check**

Run: `node --check src/main.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat: inject syntax theme CSS and handle open-error in frontend"
```

---

## Task 5: Verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -8`
Expected: 16 tests pass.

- [ ] **Step 2: Clippy clean**

Run: `~/.cargo/bin/cargo clippy --manifest-path src-tauri/Cargo.toml 2>&1 | tail -15`
Expected: no warnings on the new code.

- [ ] **Step 3: GUI smoke test (run by the human)**

The controller hands these to the user. Run `npm run tauri dev` and verify:
- [ ] Menu bar has an **Edit** menu; in the viewport, ⌘A selects text and ⌘C copies it.
- [ ] The sample's ```` ```rust ```` block renders **with syntax colors**; toggle OS appearance (light/dark) and confirm the code theme adapts.
- [ ] Open a `.md` containing fenced code in another language (e.g. ```` ```python ````) → it's colored.
- [ ] Recent pruning — startup: delete a file that's in Open Recent, relaunch → it's gone from the submenu. Failed open: open a file, delete it while the app runs, click it under Open Recent → a ⚠️ error shows in the viewport and the entry disappears from the menu.
- [ ] Regression: `/tmp/xss.md` still renders text with the window title unchanged (script stripped).

- [ ] **Step 4: Commit any tweaks**

```bash
git add -A
git commit -m "test: verify edit menu, pruning, and highlighting" --allow-empty
```
