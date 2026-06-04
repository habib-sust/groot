# Soft Warm "Sage & Rose" Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the slate/One-Dark OS-adaptive theming with one fixed soft warm theme — cream page, amber links, dusty-pink borders, sage callouts + code panel, and a bundled muted-light syntax theme.

**Architecture:** Swap the bundled `.tmTheme` (One-Dark → a warm muted light theme) and simplify `syntax_css()` to emit that single theme (no light/dark `@media`). Collapse `styles.css` to a single `:root` warm palette and add sage callout styling. Highlighting pipeline, menu, window title, and frontend are unchanged.

**Tech Stack:** Rust, Tauri v2, `syntect`, vanilla CSS.

---

## ⚠️ Note
Use `~/.cargo/bin/cargo` (cargo is NOT on the default Bash PATH). `css_for_theme_with_class_style` outputs colors as lowercase `#rrggbb`; tests match on the hex substring.

## File Structure
- `src-tauri/themes/groot-warm.tmTheme` — **new** bundled light syntax theme.
- `src-tauri/themes/onedark.tmTheme` — **delete**.
- `src-tauri/src/markdown.rs` — load the warm theme; `syntax_css()` emits one theme; update tests.
- `src/styles.css` — single `:root` warm palette + sage callouts.

---

## Task 1: Swap the bundled syntax theme to warm muted-light

**Files:**
- Create: `src-tauri/themes/groot-warm.tmTheme`
- Delete: `src-tauri/themes/onedark.tmTheme`
- Modify: `src-tauri/src/markdown.rs`

- [ ] **Step 1: Create `src-tauri/themes/groot-warm.tmTheme`** with EXACTLY:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>name</key>
	<string>Groot Warm (Sage &amp; Rose)</string>
	<key>settings</key>
	<array>
		<dict>
			<key>settings</key>
			<dict>
				<key>background</key>
				<string>#ECF0E6</string>
				<key>foreground</key>
				<string>#4B4540</string>
				<key>caret</key>
				<string>#B5841F</string>
				<key>selection</key>
				<string>#DDE3D2</string>
				<key>lineHighlight</key>
				<string>#E3E9D8</string>
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
				<string>#9AA08C</string>
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
				<string>#B5841F</string>
			</dict>
		</dict>
		<dict>
			<key>name</key>
			<string>Operator, Punctuation</string>
			<key>scope</key>
			<string>keyword.operator, punctuation, meta.brace, meta.delimiter</string>
			<key>settings</key>
			<dict>
				<key>foreground</key>
				<string>#6F685E</string>
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
				<string>#B06A7A</string>
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
				<string>#BF6E3F</string>
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
				<string>#8A6D3B</string>
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
				<string>#5C7FA3</string>
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
				<string>#6E8E5E</string>
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
				<string>#B06A7A</string>
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
				<string>#B5841F</string>
			</dict>
		</dict>
	</array>
</dict>
</plist>
```

- [ ] **Step 2: Delete the One-Dark theme**

```bash
git rm src-tauri/themes/onedark.tmTheme
```

- [ ] **Step 3: Update the tests in `markdown.rs`**

In `src-tauri/src/markdown.rs`, in the `#[cfg(test)] mod tests` block: DELETE the existing `syntax_css_has_light_and_dark` test and the `dark_theme_uses_onedark_palette` test, and ADD these two:

```rust
    #[test]
    fn syntax_css_uses_warm_theme() {
        // The bundled warm theme uses dusty rose (#b06a7a) for strings; its presence
        // proves the bundled theme loaded (not the built-in fallback).
        let css = syntax_css().to_lowercase();
        assert!(css.contains("b06a7a"), "expected warm dusty-rose in css, got: {css}");
    }

    #[test]
    fn syntax_css_has_no_dark_media() {
        // Single fixed theme — no light/dark media query.
        assert!(
            !syntax_css().contains("prefers-color-scheme"),
            "single fixed theme should not emit a dark media query"
        );
    }
```

- [ ] **Step 4: Run tests to verify failure**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml markdown 2>&1 | tail -20`
Expected: compile error (the deleted tests referenced nothing new, but the build still references `onedark.tmTheme` via `include_bytes!`, which is now gone) OR test failures. Either way confirms work remains. (You will fix the `include_bytes!` path in the next step.)

- [ ] **Step 5: Replace the theme loader + `syntax_css` in `markdown.rs`**

(a) Replace the One-Dark const + `dark_theme()` (currently lines ~24-33):
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
with:
```rust
/// The bundled warm "Sage & Rose" syntax theme (compiled into the binary).
const WARM_TMTHEME: &[u8] = include_bytes!("../themes/groot-warm.tmTheme");

fn theme() -> &'static Theme {
    static THEME: OnceLock<Theme> = OnceLock::new();
    THEME.get_or_init(|| {
        ThemeSet::load_from_reader(&mut Cursor::new(WARM_TMTHEME))
            .unwrap_or_else(|_| theme_set().themes["InspiredGitHub"].clone())
    })
}
```

(b) Replace the entire `syntax_css` function (currently lines ~114-127) with:
```rust
/// CSS for syntax highlighting using the single bundled warm theme (no light/dark
/// split). Class names match the prefix used by `parse_markdown`'s highlighter.
#[tauri::command]
pub fn syntax_css() -> String {
    css_for_theme_with_class_style(theme(), CLASS_STYLE).unwrap_or_default()
}
```

(`theme_set()` is still used as the parse-failure fallback, so leave it and the `ThemeSet`/`Theme`/`Cursor` imports in place.)

- [ ] **Step 6: Build + test**

Run: `~/.cargo/bin/cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -20` → clean.
Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -8`
Expected: all pass (17 total: 9 markdown + 8 recent_files), including `syntax_css_uses_warm_theme` and `syntax_css_has_no_dark_media`.
If `syntax_css_uses_warm_theme` fails, the `.tmTheme` didn't parse (fell back to InspiredGitHub) — temporarily `.expect()` the load to surface the parse error, fix the theme, then restore the fallback.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/themes/groot-warm.tmTheme src-tauri/src/markdown.rs
git rm --cached src-tauri/themes/onedark.tmTheme 2>/dev/null; git add -A src-tauri/themes
git commit -m "feat: replace One-Dark with bundled warm Sage & Rose syntax theme"
```

---

## Task 2: Single fixed warm palette in `styles.css`

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Replace the ENTIRE contents of `src/styles.css` with**

```css
:root {
  --bg: #faf5ee;
  --fg: #4b4540;
  --heading: #33302c;
  --muted: #8c857a;
  --border: #dcc3be;
  --rule: #dcc3be;
  --link: #b5841f;
  --accent: #8f6716;
  --code-bg: #ecf0e6;
  --inline-code-bg: #e8eedd;
  --callout-bg: #ebf0e4;
  --callout-border: #9cae8a;
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
  padding: 0.6em 1em;
  color: var(--muted);
  background: var(--callout-bg);
  border-left: 4px solid var(--callout-border);
  border-radius: 0 6px 6px 0;
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

.error { color: #b06a7a; font-weight: 600; }
```

- [ ] **Step 2: Verify braces balanced + no media query**

Run:
```bash
node -e "const fs=require('fs');const c=fs.readFileSync('src/styles.css','utf8');const o=(c.match(/{/g)||[]).length,cl=(c.match(/}/g)||[]).length;if(o!==cl){console.error('brace mismatch',o,cl);process.exit(1)}if(c.includes('prefers-color-scheme')){console.error('should be single fixed theme');process.exit(1)}console.log('ok, braces',o)"
```
Expected: `ok, braces <n>`.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: single fixed warm Sage & Rose page theme"
```

---

## Task 3: Verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite + clippy**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -8` → 17 pass.
Run: `~/.cargo/bin/cargo clippy --manifest-path src-tauri/Cargo.toml 2>&1 | tail -15` → no new warnings.

- [ ] **Step 2: GUI smoke test (run by the human)**

Run `npm run tauri dev` and verify:
- [ ] The app shows the warm cream theme **regardless** of OS light/dark setting (toggle the OS appearance — it should NOT change).
- [ ] Headings, body text are warm-toned; links are amber + underlined; `hr`, heading underlines, and table borders are dusty pink.
- [ ] Blockquotes render as sage callouts (sage left border + subtle sage background).
- [ ] Open `/tmp/code.md` → the code block sits on a sage panel with muted colors (amber keywords, dusty-rose strings, sage types); window title becomes `code.md`.
- [ ] Regression: Edit menu (⌘A/⌘C) works; Open Recent pruning works; `/tmp/xss.md` renders text with no script execution.

- [ ] **Step 3: Commit any tweaks**

```bash
git add -A
git commit -m "test: verify warm Sage & Rose theme" --allow-empty
```
