# MarkText-style UI Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the viewer to a MarkText-style look — slate dark theme, near-black code panel with a One-Dark palette, comfortable typography, muted links, and the open file's name in the window title.

**Architecture:** Bundle a One-Dark `.tmTheme` compiled into the binary via `include_bytes!`; syntect uses it for the dark code CSS (InspiredGitHub stays for light). Retune `styles.css` light/dark variables + typography. Set the native window title to the opened file's name Rust-side in `on_file_chosen`.

**Tech Stack:** Rust, Tauri v2, `syntect`, vanilla CSS.

---

## ⚠️ Note (read before Task 1)
syntect's single-theme loader is `syntect::highlighting::ThemeSet::load_from_reader(&mut R)` where `R: BufRead + Seek` — `std::io::Cursor<&[u8]>` satisfies both. If the exact signature differs in the installed syntect (5.x), adjust the call (check `cargo doc -p syntect`) but keep the behavior: load the embedded `.tmTheme` once, fall back to a built-in dark theme on error. Use `~/.cargo/bin/cargo` (cargo is NOT on the default Bash PATH).

## File Structure
- `src-tauri/themes/onedark.tmTheme` — **new** bundled TextMate theme (compiled in via `include_bytes!`).
- `src-tauri/src/markdown.rs` — load the bundled dark theme; `syntax_css()` uses it for dark.
- `src-tauri/src/menu.rs` — set the window title in `on_file_chosen`.
- `src/styles.css` — retune light/dark variables + typography/links/rule.

---

## Task 1: Bundle the One-Dark theme and use it for dark code CSS

**Files:**
- Create: `src-tauri/themes/onedark.tmTheme`
- Modify: `src-tauri/src/markdown.rs`

- [ ] **Step 1: Create the theme asset `src-tauri/themes/onedark.tmTheme`**

Create the directory `src-tauri/themes/` and the file `src-tauri/themes/onedark.tmTheme` with EXACTLY this content (a valid TextMate `.tmTheme` plist; string color is coral `#e06c75` to match the reference):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>name</key>
	<string>OneDark (groot)</string>
	<key>settings</key>
	<array>
		<dict>
			<key>settings</key>
			<dict>
				<key>background</key>
				<string>#21242B</string>
				<key>foreground</key>
				<string>#ABB2BF</string>
				<key>caret</key>
				<string>#528BFF</string>
				<key>selection</key>
				<string>#3E4451</string>
				<key>lineHighlight</key>
				<string>#2C313C</string>
			</dict>
		</dict>
		<dict>
			<key>name</key>
			<string>Comment</string>
			<key>scope</key>
			<string>comment, punctuation.definition.comment</string>
			<key>settings</key>
			<dict>
				<key>fontStyle</key>
				<string>italic</string>
				<key>foreground</key>
				<string>#5C6370</string>
			</dict>
		</dict>
		<dict>
			<key>name</key>
			<string>Keyword, Storage</string>
			<key>scope</key>
			<string>keyword, keyword.control, storage, storage.type, storage.modifier, keyword.operator.expression</string>
			<key>settings</key>
			<dict>
				<key>foreground</key>
				<string>#C678DD</string>
			</dict>
		</dict>
		<dict>
			<key>name</key>
			<string>Operator</string>
			<key>scope</key>
			<string>keyword.operator</string>
			<key>settings</key>
			<dict>
				<key>foreground</key>
				<string>#56B6C2</string>
			</dict>
		</dict>
		<dict>
			<key>name</key>
			<string>String</string>
			<key>scope</key>
			<string>string, string.quoted, string.template, punctuation.definition.string</string>
			<key>settings</key>
			<dict>
				<key>foreground</key>
				<string>#E06C75</string>
			</dict>
		</dict>
		<dict>
			<key>name</key>
			<string>Constant, Number</string>
			<key>scope</key>
			<string>constant.numeric, constant.language, constant.character, support.constant</string>
			<key>settings</key>
			<dict>
				<key>foreground</key>
				<string>#D19A66</string>
			</dict>
		</dict>
		<dict>
			<key>name</key>
			<string>Variable</string>
			<key>scope</key>
			<string>variable, variable.parameter, variable.other, meta.definition.variable</string>
			<key>settings</key>
			<dict>
				<key>foreground</key>
				<string>#E06C75</string>
			</dict>
		</dict>
		<dict>
			<key>name</key>
			<string>Function</string>
			<key>scope</key>
			<string>entity.name.function, support.function, meta.function-call, variable.function</string>
			<key>settings</key>
			<dict>
				<key>foreground</key>
				<string>#61AFEF</string>
			</dict>
		</dict>
		<dict>
			<key>name</key>
			<string>Type, Class</string>
			<key>scope</key>
			<string>entity.name.type, entity.name.class, entity.other.inherited-class, support.type, support.class</string>
			<key>settings</key>
			<dict>
				<key>foreground</key>
				<string>#E5C07B</string>
			</dict>
		</dict>
		<dict>
			<key>name</key>
			<string>Tag</string>
			<key>scope</key>
			<string>entity.name.tag</string>
			<key>settings</key>
			<dict>
				<key>foreground</key>
				<string>#E06C75</string>
			</dict>
		</dict>
		<dict>
			<key>name</key>
			<string>Attribute</string>
			<key>scope</key>
			<string>entity.other.attribute-name</string>
			<key>settings</key>
			<dict>
				<key>foreground</key>
				<string>#D19A66</string>
			</dict>
		</dict>
		<dict>
			<key>name</key>
			<string>Punctuation</string>
			<key>scope</key>
			<string>punctuation, meta.brace, meta.delimiter</string>
			<key>settings</key>
			<dict>
				<key>foreground</key>
				<string>#ABB2BF</string>
			</dict>
		</dict>
	</array>
</dict>
</plist>
```

- [ ] **Step 2: Add a failing test in `markdown.rs`**

In `src-tauri/src/markdown.rs`, inside the `#[cfg(test)] mod tests` block, add:

```rust
    #[test]
    fn dark_theme_uses_onedark_palette() {
        // The bundled One-Dark theme uses coral (#e06c75) for strings; the built-in
        // default dark theme does not. Its presence proves the bundled theme loaded.
        let css = syntax_css().to_lowercase();
        assert!(css.contains("e06c75"), "expected One-Dark coral in css, got: {css}");
    }
```

- [ ] **Step 3: Run it to verify it fails**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml markdown 2>&1 | tail -20`
Expected: `dark_theme_uses_onedark_palette` FAILS (current dark theme is base16-ocean.dark, no `e06c75`).

- [ ] **Step 4: Load the bundled theme and use it in `syntax_css`**

In `src-tauri/src/markdown.rs`:

(a) Update the syntect imports. Change:
```rust
use syntect::highlighting::ThemeSet;
```
to:
```rust
use std::io::Cursor;
use syntect::highlighting::{Theme, ThemeSet};
```
(Keep the other existing `use` lines. `std::sync::OnceLock` is already imported.)

(b) Add, right after the existing `theme_set()` function:
```rust
/// The bundled One-Dark theme (compiled into the binary), used for dark-mode code.
const ONEDARK_TMTHEME: &[u8] = include_bytes!("../themes/onedark.tmTheme");

fn dark_theme() -> &'static Theme {
    static DARK: OnceLock<Theme> = OnceLock::new();
    DARK.get_or_init(|| {
        ThemeSet::load_from_reader(&mut Cursor::new(ONEDARK_TMTHEME))
            .unwrap_or_else(|_| theme_set().themes["base16-ocean.dark"].clone())
    })
}
```

(c) Replace the `syntax_css` function body's `dark` binding so it uses `dark_theme()` instead of the built-in. The function becomes:
```rust
#[tauri::command]
pub fn syntax_css() -> String {
    let ts = theme_set();
    let light = ts
        .themes
        .get("InspiredGitHub")
        .and_then(|t| css_for_theme_with_class_style(t, CLASS_STYLE).ok())
        .unwrap_or_default();
    let dark = css_for_theme_with_class_style(dark_theme(), CLASS_STYLE).unwrap_or_default();
    format!("{light}\n@media (prefers-color-scheme: dark) {{\n{dark}\n}}\n")
}
```

- [ ] **Step 5: Build + run tests**

Run: `~/.cargo/bin/cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -20` → clean (fix loader signature per the ⚠️ note if needed).
Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -8`
Expected: all tests pass, including `dark_theme_uses_onedark_palette` and the existing `syntax_css_has_light_and_dark`. (17 total: 9 markdown + 8 recent_files.)

If `dark_theme_uses_onedark_palette` still fails, the theme didn't parse — inspect the build/runtime: confirm the `.tmTheme` is valid plist and the `load_from_reader` call succeeded (temporarily `.expect()` instead of the fallback to surface a parse error), fix the theme/loader, then restore the fallback.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/themes/onedark.tmTheme src-tauri/src/markdown.rs
git commit -m "feat: bundle One-Dark theme for dark-mode syntax colors"
```

---

## Task 2: Set the window title to the open file's name

**Files:**
- Modify: `src-tauri/src/menu.rs`

- [ ] **Step 1: Set the title in `on_file_chosen`**

In `src-tauri/src/menu.rs`, at the START of the `on_file_chosen` function body (before the recent-store update), add:

```rust
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_title(name);
        }
    }
```

`get_webview_window` comes from the `tauri::Manager` trait, which is already imported in this file. The default window label is `"main"`. This runs for both the dialog-open and recent-open paths (both call `on_file_chosen`); the failed/missing-recent path does not call it, so a missing file leaves the title unchanged.

- [ ] **Step 2: Build + test**

Run: `~/.cargo/bin/cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -15` → clean. If `set_title` needs a different call form in tauri 2.11.2, adjust per the compiler (it's a method on `WebviewWindow`).
Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6` → all pass.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/menu.rs
git commit -m "feat: set window title to the opened file's name"
```

---

## Task 3: Restyle `styles.css`

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Replace the entire contents of `src/styles.css` with**

```css
:root {
  --bg: #ffffff;
  --fg: #24292f;
  --heading: #1f2328;
  --muted: #57606a;
  --border: #d0d7de;
  --rule: #d8dee4;
  --code-bg: #f6f8fa;
  --inline-code-bg: #eff1f3;
  --link: #2f4fd0;
  --accent: #3b5bdb;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #2e3138;
    --fg: #abb2bf;
    --heading: #e6e6e6;
    --muted: #8b94a1;
    --border: #3a3f47;
    --rule: #3a3f47;
    --code-bg: #21242b;
    --inline-code-bg: #3a3f47;
    --link: #9db2ff;
    --accent: #c8d3ff;
  }
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}

#viewport {
  max-width: 860px;
  margin: 0 auto;
  padding: 40px 32px 80px;
  font-size: 17px;
  line-height: 1.7;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4 {
  color: var(--heading);
  font-weight: 700;
  line-height: 1.25;
  margin: 1.6em 0 0.6em;
}

.markdown-body h1 { font-size: 2em; }
.markdown-body h2 { font-size: 1.5em; }
.markdown-body h3 { font-size: 1.25em; }

.markdown-body h1,
.markdown-body h2 {
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.3em;
}

.markdown-body p { margin: 0.9em 0; }

.markdown-body a {
  color: var(--link);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.markdown-body a:hover { color: var(--accent); }

.markdown-body code {
  background: var(--inline-code-bg);
  padding: 0.15em 0.4em;
  border-radius: 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.88em;
}

.markdown-body pre {
  background: var(--code-bg);
  padding: 18px 20px;
  border-radius: 8px;
  overflow: auto;
  line-height: 1.5;
}

.markdown-body pre code {
  background: none;
  padding: 0;
  font-size: 0.9em;
}

.markdown-body blockquote {
  margin: 1em 0;
  padding: 0 1em;
  color: var(--muted);
  border-left: 3px solid var(--border);
}

.markdown-body hr {
  border: 0;
  border-top: 1px solid var(--rule);
  margin: 2em 0;
}

.markdown-body table {
  border-collapse: collapse;
  margin: 1em 0;
}

.markdown-body th,
.markdown-body td {
  border: 1px solid var(--border);
  padding: 8px 14px;
}

.markdown-body th { font-weight: 700; }

.markdown-body img { max-width: 100%; }

.error { color: #e06c75; font-weight: 600; }
```

- [ ] **Step 2: Syntax sanity check**

Run: `node -e "const fs=require('fs');const c=fs.readFileSync('src/styles.css','utf8');const o=(c.match(/{/g)||[]).length,cl=(c.match(/}/g)||[]).length;if(o!==cl){console.error('brace mismatch',o,cl);process.exit(1)}console.log('css braces balanced',o)"`
Expected: `css braces balanced <n>` (open/close braces match).

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: MarkText-style typography and slate dark theme"
```

---

## Task 4: Verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite + clippy**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -8` → all pass (17 total).
Run: `~/.cargo/bin/cargo clippy --manifest-path src-tauri/Cargo.toml 2>&1 | tail -15` → no warnings on new code.

- [ ] **Step 2: GUI smoke test (run by the human — combines this restyle + the prior highlighting/menu/pruning verification)**

Run `npm run tauri dev` and verify:
- [ ] **Dark look:** in dark OS appearance, the page background is the slate tone and code blocks are a darker near-black panel; the ```` ```rust ```` sample shows One-Dark colors (purple keywords, coral strings).
- [ ] **Light look:** in light appearance, a clean white reading view; typography (headings, spacing, muted underlined links, section rule) matches the MarkText-style reference.
- [ ] **Window title:** opening `/tmp/code.md` sets the window title to `code.md`; on launch it reads `Groot — Markdown Viewer`.
- [ ] **Edit menu:** Edit menu present; ⌘A selects, ⌘C copies in the viewport.
- [ ] **Recent pruning:** delete a recent file while running and click it under Open Recent → ⚠️ error + entry removed; deleted-then-relaunch → gone at startup.
- [ ] **Highlighting other langs:** open `/tmp/code.md` (python) → colored; inline `` `code` `` stays plain.
- [ ] **XSS regression:** `/tmp/xss.md` renders text, window title shows `xss.md`, no script executes.

- [ ] **Step 3: Commit any tweaks**

```bash
git add -A
git commit -m "test: verify MarkText-style restyle" --allow-empty
```
