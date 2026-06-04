# Slate + Warm-Muted Dark Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the dark variant to a slate background with the muted warm palette (amber links, dusty-pink borders, sage callouts + sage-toned code).

**Architecture:** Pure value changes — swap the dark `@media` variables in `styles.css` from warm-brown to slate, and update the `groot-warm-dark.tmTheme` background to the slate panel color. No Rust logic or test changes (the dark theme's token colors are unchanged, so existing tests stay green).

**Tech Stack:** vanilla CSS, syntect TextMate theme.

## ⚠️ Note
Use `~/.cargo/bin/cargo` (cargo is NOT on the default Bash PATH).

---

## Task 1: Slate dark palette + theme panel background

**Files:**
- Modify: `src/styles.css`
- Modify: `src-tauri/themes/groot-warm-dark.tmTheme`

- [ ] **Step 1: Replace the dark `@media` block in `src/styles.css`**

Find the existing dark block (currently the warm-brown values) and replace the whole `@media (prefers-color-scheme: dark) { :root { … } }` block with:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #2e3138;
    --fg: #c8c4bb;
    --heading: #ece8e0;
    --muted: #8d8f8c;
    --border: #6f585c;
    --rule: #6f585c;
    --link: #d8a43e;
    --accent: #e9bd63;
    --code-bg: #24272c;
    --inline-code-bg: #3a3e44;
    --callout-bg: #2c322b;
    --callout-border: #7f9670;
  }
}
```
Do not touch the light `:root` block or any other rule.

- [ ] **Step 2: Update the theme panel background**

In `src-tauri/themes/groot-warm-dark.tmTheme`, change ONLY the global background value (the first `<dict>`'s `background`) from:
```xml
				<string>#1F1D19</string>
```
to:
```xml
				<string>#24272C</string>
```
(It is the `<string>` immediately following the first `<key>background</key>`.) Leave all token foreground colors unchanged.

- [ ] **Step 3: Verify**

Run: `node -e "const fs=require('fs');const c=fs.readFileSync('src/styles.css','utf8');const o=(c.match(/{/g)||[]).length,cl=(c.match(/}/g)||[]).length;if(o!==cl){console.error('brace mismatch',o,cl);process.exit(1)}if(!c.includes('#2e3138')){console.error('slate bg missing');process.exit(1)}console.log('css ok, braces',o)"`
Expected: `css ok, braces <n>`.

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6`
Expected: 18 tests pass (unchanged — token colors and the `#d98c9a` dark-string assertion still hold; only the panel background hex changed).

- [ ] **Step 4: Commit**

```bash
git add src/styles.css src-tauri/themes/groot-warm-dark.tmTheme
git commit -m "feat: slate dark background with warm-muted accents"
```

---

## Task 2: Verification

- [ ] **Step 1: GUI smoke test (run by the human)**

Run `npm run tauri dev` in macOS **dark** mode and verify:
- [ ] Page background is slate (`#2e3138`); body text warm light gray; headings near-white.
- [ ] Links are amber; `hr`, heading underlines, and table borders are dusty-pink/mauve.
- [ ] Blockquotes are sage callouts; the code block sits on a slate near-black panel with sage types / amber keywords / dusty-rose strings (NOT purple/coral).
- [ ] Switch macOS to **light** → the warm cream theme is unchanged.
- [ ] Regression: open `/tmp/code.md` → highlighted, title `code.md`; Edit menu ⌘A/⌘C; `/tmp/xss.md` no script.
