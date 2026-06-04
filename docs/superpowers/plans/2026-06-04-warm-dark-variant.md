# Warm Dark Variant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the warm theme follow macOS dark mode by adding a cohesive warm-dark variant (light theme unchanged).

**Architecture:** Bundle a second syntax theme (`groot-warm-dark.tmTheme`); `syntax_css()` emits the light theme plus the dark theme wrapped in a `prefers-color-scheme: dark` media query. Re-add a dark `@media` block to `styles.css` with warm-dark variables.

**Tech Stack:** Rust, Tauri v2, `syntect`, vanilla CSS.

## ⚠️ Note
Use `~/.cargo/bin/cargo` (cargo is NOT on the default Bash PATH). `css_for_theme_with_class_style` outputs lowercase `#rrggbb`; tests match on the hex substring.

## File Structure
- `src-tauri/themes/groot-warm-dark.tmTheme` — **new** bundled dark syntax theme.
- `src-tauri/src/markdown.rs` — add `dark_theme()`; `syntax_css()` emits light + dark `@media`; update tests.
- `src/styles.css` — re-add a `@media (prefers-color-scheme: dark)` block (warm-dark vars).

---

## Task 1: Add the warm-dark syntax theme and emit light + dark CSS

**Files:**
- Create: `src-tauri/themes/groot-warm-dark.tmTheme`
- Modify: `src-tauri/src/markdown.rs`

- [ ] **Step 1: Create `src-tauri/themes/groot-warm-dark.tmTheme`** with EXACTLY:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>name</key>
	<string>Groot Warm Dark (Sage &amp; Rose)</string>
	<key>settings</key>
	<array>
		<dict>
			<key>settings</key>
			<dict>
				<key>background</key>
				<string>#1F1D19</string>
				<key>foreground</key>
				<string>#D6CCBE</string>
				<key>caret</key>
				<string>#D8A43E</string>
				<key>selection</key>
				<string>#3A352C</string>
				<key>lineHighlight</key>
				<string>#2A2620</string>
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
				<string>#7D7565</string>
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
				<string>#D8A43E</string>
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
				<string>#9A9082</string>
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
				<string>#D98C9A</string>
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
				<string>#D98A5A</string>
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
				<string>#C9A06A</string>
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
				<string>#7FA8CF</string>
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
				<string>#9CBF86</string>
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
				<string>#D98C9A</string>
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
				<string>#D8A43E</string>
			</dict>
		</dict>
	</array>
</dict>
</plist>
```

- [ ] **Step 2: Update the tests in `markdown.rs`**

In the `#[cfg(test)] mod tests` block: DELETE the `syntax_css_has_no_dark_media` test and ADD these two:

```rust
    #[test]
    fn syntax_css_has_dark_media() {
        assert!(
            syntax_css().contains("prefers-color-scheme"),
            "syntax_css should emit a dark media block"
        );
    }

    #[test]
    fn syntax_css_dark_uses_warm_dark() {
        // The warm-dark theme uses #d98c9a for strings; presence proves it loaded.
        let css = syntax_css().to_lowercase();
        assert!(css.contains("d98c9a"), "expected warm-dark rose in css, got: {css}");
    }
```
(Keep `syntax_css_uses_warm_theme`, which asserts the light `#b06a7a`.)

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml markdown 2>&1 | tail -20`
Expected: `syntax_css_has_dark_media` and `syntax_css_dark_uses_warm_dark` FAIL (current `syntax_css` emits a single theme, no media query, no `#d98c9a`).

- [ ] **Step 4: Add `dark_theme()` in `markdown.rs`**

Immediately AFTER the existing `theme()` function (ends at the line with `}` after the `THEME.get_or_init` block), add:

```rust
/// The bundled warm-dark syntax theme, used under macOS dark mode.
const WARM_DARK_TMTHEME: &[u8] = include_bytes!("../themes/groot-warm-dark.tmTheme");

fn dark_theme() -> &'static Theme {
    static DARK: OnceLock<Theme> = OnceLock::new();
    DARK.get_or_init(|| {
        ThemeSet::load_from_reader(&mut Cursor::new(WARM_DARK_TMTHEME))
            .unwrap_or_else(|_| theme_set().themes["base16-ocean.dark"].clone())
    })
}
```

- [ ] **Step 5: Update `syntax_css` to emit light + dark**

Replace the entire current `syntax_css` function with:

```rust
/// CSS for syntax highlighting: the warm light theme plus the warm-dark theme
/// wrapped in a prefers-color-scheme media query. Class names match the prefix
/// used by `parse_markdown`'s highlighter.
#[tauri::command]
pub fn syntax_css() -> String {
    let light = css_for_theme_with_class_style(theme(), CLASS_STYLE).unwrap_or_default();
    let dark = css_for_theme_with_class_style(dark_theme(), CLASS_STYLE).unwrap_or_default();
    format!("{light}\n@media (prefers-color-scheme: dark) {{\n{dark}\n}}\n")
}
```

- [ ] **Step 6: Build + test**

Run: `~/.cargo/bin/cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -20` → clean.
Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -8`
Expected: all pass (18 total: 10 markdown + 8 recent_files), including `syntax_css_has_dark_media`, `syntax_css_dark_uses_warm_dark`, and the existing `syntax_css_uses_warm_theme`.
If `syntax_css_dark_uses_warm_dark` fails, the dark `.tmTheme` didn't parse (fell back) — temporarily `.expect()` the dark load to surface the error, fix the theme, restore the fallback.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/themes/groot-warm-dark.tmTheme src-tauri/src/markdown.rs
git commit -m "feat: add warm-dark syntax theme, emit light + dark CSS"
```

---

## Task 2: Re-add the dark `@media` block to `styles.css`

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Insert the dark media block**

In `src/styles.css`, immediately AFTER the closing `}` of the `:root { … }` block (and before the `* { box-sizing: border-box; }` line), insert:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #26231f;
    --fg: #d6ccbe;
    --heading: #efe7da;
    --muted: #978d7e;
    --border: #574c44;
    --rule: #574c44;
    --link: #d8a43e;
    --accent: #e9bd63;
    --code-bg: #1f1d19;
    --inline-code-bg: #353029;
    --callout-bg: #29302a;
    --callout-border: #7f9670;
  }
}
```

Do not change the light `:root` block or any other rule.

- [ ] **Step 2: Verify braces balanced + dark media present**

Run:
```bash
node -e "const fs=require('fs');const c=fs.readFileSync('src/styles.css','utf8');const o=(c.match(/{/g)||[]).length,cl=(c.match(/}/g)||[]).length;if(o!==cl){console.error('brace mismatch',o,cl);process.exit(1)}if(!c.includes('prefers-color-scheme')){console.error('missing dark media block');process.exit(1)}console.log('ok, braces',o)"
```
Expected: `ok, braces <n>`.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: warm-dark page palette under prefers-color-scheme"
```

---

## Task 3: Verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite + clippy**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -8` → 18 pass.
Run: `~/.cargo/bin/cargo clippy --manifest-path src-tauri/Cargo.toml 2>&1 | tail -15` → no new warnings.

- [ ] **Step 2: GUI smoke test (run by the human)**

Run `npm run tauri dev` and verify:
- [ ] In macOS **light** mode: the warm cream theme (unchanged) with the sage code panel + muted light syntax.
- [ ] In macOS **dark** mode: a warm charcoal page (`#26231f`), dark near-black code panel, brighter amber keywords / dusty-rose strings / sage types; amber links; sage callouts; dusty-brown borders.
- [ ] **Live switch:** toggle macOS appearance while the app is open → it switches between the two themes (may require reopening/re-rendering the document; the page chrome switches immediately via CSS).
- [ ] Regression: open `/tmp/code.md` → code highlighted in the active theme, window title `code.md`; Edit menu ⌘A/⌘C work; `/tmp/xss.md` renders text with no script execution.

- [ ] **Step 3: Commit any tweaks**

```bash
git add -A
git commit -m "test: verify warm dark variant" --allow-empty
```
