# Slash / Block Menu — Configure & Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trim Crepe's already-enabled slash/block menu to blocks that work in the editor *and* export faithfully (drop Image + Math, disable LaTeX), and confirm it reads well in both themes.

**Architecture:** Pure frontend configuration of the Crepe editor in `src/main.js`'s `render()` constructor (the `BlockEdit` feature + a `features` toggle), plus optional theme verification. No new dependencies, no Rust changes.

**Tech Stack:** Vite, Tauri v2, `@milkdown/crepe` (already installed), vanilla JS/CSS.

---

## ⚠️ Notes for the implementer
- Use `~/.cargo/bin/cargo` (not on default PATH). Branch is `feat/slash-menu-find-replace`.
- **No JS unit-test harness** exists; `npm run build` (Vite) is the authoritative syntax/bundle check, and the GUI smoke test is the real behavioral check. Rust is untouched, so `cargo test` must stay at 24.
- Crepe enables `BlockEdit`, `Latex`, `ImageBlock`, `Table`, `CodeMirror`, `Toolbar` by default; groot does not disable any. `CrepeFeature` is already imported in `src/main.js`.

## File Structure
- `src/main.js` — the only required change: extend the `new Crepe({...})` config in `render()` with a `features` toggle (disable Latex) and a `BlockEdit` feature config (drop Image + Math menu items).
- `src/styles.css` — only if a specific block-menu color reads wrong in a theme.

---

## Task 1: Configure the slash menu (drop Image + Math, disable LaTeX)

**Files:**
- Modify: `src/main.js` (the `new Crepe({...})` call inside `render()`)

- [ ] **Step 1: Locate the current Crepe constructor**

In `src/main.js`, `render()` currently constructs Crepe like this (added during the Slice D copy-feedback fix):
```js
    crepe = new Crepe({
      root: viewport,
      defaultValue: markdown,
      featureConfigs: {
        // Crepe's code-block copy button copies silently; surface feedback.
        [CrepeFeature.CodeMirror]: { onCopy: () => showToast("Copied!") },
      },
    });
```

- [ ] **Step 2: Add the `features` toggle and `BlockEdit` config**

Replace that `new Crepe({...})` call with:
```js
    crepe = new Crepe({
      root: viewport,
      defaultValue: markdown,
      // Disable LaTeX so $…$ doesn't render editor-only math that Export/Print
      // (pulldown-cmark, no math) would silently drop — editor matches export.
      features: {
        [CrepeFeature.Latex]: false,
      },
      featureConfigs: {
        // Crepe's code-block copy button copies silently; surface feedback.
        [CrepeFeature.CodeMirror]: { onCopy: () => showToast("Copied!") },
        // Slash menu: drop Image (URL-only; no local-file pipeline) and Math
        // (not supported in export). Keep code block + table, lists, text/headings.
        [CrepeFeature.BlockEdit]: {
          advancedGroup: { image: null, math: null },
        },
      },
    });
```
(`CrepeFeature` is already imported at the top of the file. The `BlockEdit` config type is `DeepPartial`, so naming only `advancedGroup.image`/`.math` as `null` removes those two items while `codeBlock`, `table`, and the other groups keep their defaults.)

- [ ] **Step 3: Build**

Run: `cd /Users/habib/Github/groot && npm run build 2>&1 | tail -6`
Expected: builds clean (a pre-existing chunk-size >500 kB warning is fine).

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat: trim slash menu (drop image/math) and disable LaTeX for editor/export parity"
```

---

## Task 2: Theme + behavior verification

**Files:** none unless a color fix is needed (`src/styles.css`).

- [ ] **Step 1: Headless checks**

Run: `cd /Users/habib/Github/groot && npm run build 2>&1 | tail -3` → clean.
Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | grep "test result"` → 24 passed.

- [ ] **Step 2: GUI smoke test** (`PATH="$HOME/.cargo/bin:$PATH" npm run tauri dev`)

- [ ] Type `/` on an empty line → the block menu appears and lists **only**: text, heading 1–6, quote, divider, bullet/ordered/task list, code block, table. **No Image, no Math.**
- [ ] Selecting an item inserts the correct block (try a table and a code block).
- [ ] The drag handle (hover the left gutter of a block) still appears and reorders blocks.
- [ ] Type `$x$` → it stays literal text (LaTeX disabled), and the same text exports unchanged (File → Export as HTML).
- [ ] The menu popover is legible in both Light and Dark (View → Appearance): surface, hover, and selected-item colors read correctly against the cream/slate palettes.

- [ ] **Step 3: (Only if a menu color reads wrong) add a targeted override**

If and only if a block-menu color is illegible in a theme, add a minimal override in `src/styles.css` scoped to the block-edit menu classes (inspect the live element for the exact class, e.g. `.milkdown-slash-menu` / `.menu-item`), mapping it to the app palette tokens (e.g. `background: var(--bg)`, `color: var(--fg)`, hover `var(--callout-bg)`). Do not restructure CSS. Then rebuild (`npm run build`) and verify.

- [ ] **Step 4: Commit any tweak**

```bash
git add -A
git commit -m "test: verify slash menu config + theming" --allow-empty
```
