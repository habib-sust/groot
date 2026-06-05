# WYSIWYG Slice B (Milkdown Crepe Surface) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the read-only preview with Milkdown Crepe as a single, always-editable WYSIWYG surface; opening a file loads it into the editor (in-memory; no save yet).

**Architecture:** `@milkdown/crepe` (Vite-bundled, ES imports) mounts into `#viewport`. `render(markdown)` destroys+recreates the Crepe instance with the file content. Crepe brings its own rendered structure + theme; we bridge it to the app's light/dark. find/outline/export/print are intentionally dormant until Slice D (this is the long-lived `feat/wysiwyg-editor` branch; not merged to main until coherent).

**Tech Stack:** Vite, Tauri v2, `@milkdown/crepe` (ProseMirror), vanilla JS/CSS.

## ⚠️ Notes
- Use `~/.cargo/bin/cargo`. Branch is `feat/wysiwyg-editor` (work here).
- Verified Crepe API (current): `import { Crepe } from "@milkdown/crepe"`; `import "@milkdown/crepe/theme/common/style.css"` + a theme (`frame`/`crepe`/`nord` + `-dark` variants); `new Crepe({ root, defaultValue })`; `await crepe.create()`; `crepe.getMarkdown()`; `crepe.setReadonly(bool)`; `crepe.on((l)=>l.markdownUpdated(...))`; `crepe.destroy()`. If the installed version differs, verify via its TS types / milkdown.dev and adjust.
- `npm run build` (Vite) is the authoritative syntax/bundle check (ESM imports).

## File Structure
- `package.json` (+lock) — add `@milkdown/crepe`.
- `src/main.js` — import Crepe + theme CSS; `render()` mounts/replaces Crepe; `applyTheme` bridges editor theme.
- `src/index.html` — `#viewport` loses the `markdown-body` class (so viewer CSS doesn't fight Crepe's theme).
- `src/styles.css` — Crepe container sizing + light/dark CSS-variable bridge.

---

## Task 1: Mount Crepe as the editable surface

**Files:**
- Modify: `package.json`, `src/main.js`, `src/index.html`

- [ ] **Step 1: Install Crepe**

```bash
npm install @milkdown/crepe
```
Confirm it (and its Milkdown/ProseMirror deps) are in `node_modules`.

- [ ] **Step 2: Import Crepe + theme at the top of `src/main.js`**

Add these imports (after the existing `import stylesText from "./styles.css?raw";` line):
```js
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
```

- [ ] **Step 3: Declare the editor handle**

Add near `let currentSource = "";` (top of the module):
```js
let crepe = null;
```

- [ ] **Step 4: Rewrite `render` to mount/replace Crepe**

Replace the entire `render` function with:
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
  } catch (e) {
    crepe = null;
    showError(String(e));
  }
}
```
(This drops the old `parse_markdown`/`addCopyButtons`/`buildOutline` calls from the
render path — those features are reintegrated in Slice D. Leaving their functions
defined elsewhere in the file is fine; they're just not called from `render` now.)

- [ ] **Step 5: Drop `markdown-body` from `#viewport` (`index.html`)**

Change `<main id="viewport" class="markdown-body">` to `<main id="viewport">` so the
viewer's `.markdown-body …` rules don't conflict with Crepe's own theme on the
editor content.

- [ ] **Step 6: Build**

Run: `npm run build 2>&1 | tail -20` → builds clean (Crepe + deps bundle; the new imports resolve). If the build reports a wrong Crepe import path/method, correct it per the installed version (see ⚠️ note), preserving behavior.
Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6` → 23 pass (Rust unchanged).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/main.js src/index.html
git commit -m "feat: mount Milkdown Crepe as the editable document surface"
```

---

## Task 2: Theme bridge (light/dark) + container sizing

**Files:**
- Modify: `src/styles.css`, `src/main.js`

- [ ] **Step 1: Find Crepe's CSS custom properties**

Run: `grep -rohE "\-\-crepe[a-z0-9-]*" node_modules/@milkdown/crepe/lib/theme 2>/dev/null | sort -u | head -50`
(Capture the variable names — at minimum the background, surface, on-background/text,
and code/inline-code colors. These are what we override for dark mode. If the path
differs, locate the theme CSS under `node_modules/@milkdown/crepe/` and grep there.)

- [ ] **Step 2: Append Crepe sizing + dark overrides to `src/styles.css`**

Append at the END of `src/styles.css` (replace the `--crepe-*` names + values below
with the actual variables found in Step 1; the structure is fixed, the exact var
names come from Step 1):
```css
/* Crepe editor fills the viewport column */
#viewport .milkdown {
  height: 100%;
}

/* Dark-mode bridge: re-skin Crepe to the app's dark palette.
   Variable names are from `grep --crepe ...` (Step 1). */
:root[data-theme="dark"] .milkdown {
  --crepe-color-background: #2e3138;
  --crepe-color-on-background: #c8c4bb;
  --crepe-color-surface: #2e3138;
  --crepe-color-on-surface: #c8c4bb;
  --crepe-color-inline-code: #d98c9a;
  --crepe-color-selection: #3a3f47;
}
```
(Use the real variable names from Step 1; the listed values are the app's dark
palette. If Crepe exposes more relevant vars — e.g. for code block bg, links — set
those too so the editor reads dark, not white, in dark mode.)

- [ ] **Step 3: Confirm `applyTheme` drives it**

`applyTheme` already sets `document.documentElement.dataset.theme = eff`. That's what
the `:root[data-theme="dark"] .milkdown` overrides key off, so no JS change is needed
for the bridge. (Verify `applyTheme` still sets `dataset.theme`; if a prior slice
removed it, re-add `document.documentElement.dataset.theme = eff;`.)

- [ ] **Step 4: Build + verify**

Run: `npm run build 2>&1 | tail -8` → clean.
Run: `node -e "const fs=require('fs');const c=fs.readFileSync('src/styles.css','utf8');const o=(c.match(/{/g)||[]).length,cl=(c.match(/}/g)||[]).length;if(o!==cl){console.error('brace mismatch',o,cl);process.exit(1)}console.log('css ok, braces',o)"` → balanced.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css src/main.js
git commit -m "feat: bridge Crepe editor theme to app light/dark"
```

---

## Task 3: Verification

**Files:** none (verification only)

- [ ] **Step 1: Headless**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6` → 23 pass.
Run: `npm run build 2>&1 | tail -6` → clean.

- [ ] **Step 2: GUI smoke test (run by the human, or driven via the verify skill)**

Run `npm run tauri dev`. Then:
- [ ] The launch sample appears as **editable rich content** in a Crepe editor —
  headings look like headings, the bullet list renders, the ```` ```rust ```` block
  is a real code block (Crepe-highlighted), and there are **no raw markdown symbols**
  for non-focused text.
- [ ] Click into the document and **type** — it edits in place (e.g. add a heading,
  bold some text via `**` or the toolbar) and stays WYSIWYG.
- [ ] Open a `.md` (drag-drop or File → Open Recent) → its content loads into the
  editor.
- [ ] Toggle View → Appearance Light/Dark → the editor surface is light in light mode
  and dark (not blinding white) in dark mode.
- [ ] (Expected/known) find, outline, copy-code, export, print are NOT functional on
  this branch yet — reintegrated in Slice D. Note anything that errors loudly.

- [ ] **Step 3: Commit any tweaks**

```bash
git add -A
git commit -m "test: verify WYSIWYG slice B (Crepe surface)" --allow-empty
```
