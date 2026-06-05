# Slice A — Vite Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce Vite as the frontend dev server + bundler with the app behaving identically (globals kept; Rust unchanged).

**Architecture:** Vite (`root: src`, output `dist/`) becomes Tauri's `beforeDevCommand`/`beforeBuildCommand`, and `frontendDist` points at `dist`. `withGlobalTauri` stays on so `main.js` keeps using `window.__TAURI__`. The only code change is the export feature's `fetch("styles.css")` → a Vite `?raw` import.

**Tech Stack:** Vite, Tauri v2, vanilla JS.

## ⚠️ Note
Use `~/.cargo/bin/cargo` (cargo is NOT on the default Bash PATH). Node/npm are on PATH.

## File Structure
- New: `vite.config.js`.
- Modify: `package.json` (vite devDep + scripts), `.gitignore` (`dist/`),
  `src-tauri/tauri.conf.json` (build section), `src/main.js` (export CSS import).

---

## Task 1: Add Vite + config + gitignore

**Files:**
- Modify: `package.json`, `.gitignore`
- Create: `vite.config.js`

- [ ] **Step 1: Install Vite**

```bash
npm install --save-dev vite
```

- [ ] **Step 2: Add npm scripts**

In `package.json`, add to the `"scripts"` object (keep the existing `"tauri"` script):
```json
    "dev": "vite",
    "build": "vite build"
```

- [ ] **Step 3: Create `vite.config.js` at the repo root**

```js
import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  clearScreen: false,
});
```

- [ ] **Step 4: Ignore the build output**

Append `dist/` to `.gitignore` (create the line if not present).

- [ ] **Step 5: Verify the bundle builds**

Run: `npm run build 2>&1 | tail -15`
Expected: Vite builds without errors; `dist/index.html` and `dist/assets/` exist.
Run: `ls dist && ls dist/assets | head`
Expected: `index.html` present; hashed JS/CSS assets in `dist/assets/`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.js .gitignore
git commit -m "build: add Vite (dev server + bundler)"
```

---

## Task 2: Point Tauri at Vite + fix the export CSS source

**Files:**
- Modify: `src-tauri/tauri.conf.json`, `src/main.js`

- [ ] **Step 1: Update the `build` section of `src-tauri/tauri.conf.json`**

Replace the current `"build"` section (currently `{ "frontendDist": "../src" }`) with:
```json
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  }
```
Leave `app.withGlobalTauri` as `true` and everything else unchanged.

- [ ] **Step 2: Make the export read CSS via a Vite raw import (`src/main.js`)**

(a) Add this as the VERY FIRST line of `src/main.js` (before `const { invoke } = …`):
```js
import stylesText from "./styles.css?raw";
```
(b) In `exportHtml`, replace the fetch-based CSS with the imported text. Change:
```js
    const baseCss = await (await fetch("styles.css")).text();
    const codeCss = await invoke("syntax_css", { theme: "light" });
    const css = `${baseCss}\n${codeCss}`;
```
to:
```js
    const codeCss = await invoke("syntax_css", { theme: "light" });
    const css = `${stylesText}\n${codeCss}`;
```

- [ ] **Step 3: Verify**

Run: `node --check src/main.js`
Expected: no output. (Note: `node --check` accepts ESM `import` syntax; if it complains about `import`, that's only the CLI's module-detection — confirm the file is referenced as a module, which it is via `<script type="module">` + Vite. If `node --check` errors on the import line, instead verify with `npx vite build` below.)
Run: `npm run build 2>&1 | tail -15`
Expected: builds clean (the `?raw` import resolves; `dist/` regenerated).
Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6`
Expected: 23 pass (Rust unchanged).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json src/main.js
git commit -m "build: serve frontend via Vite/dist; export CSS via ?raw import"
```

---

## Task 3: Verification

**Files:** none (verification only)

- [ ] **Step 1: Headless**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6` → 23 pass.
Run: `npm run build 2>&1 | tail -5` → clean; `dist/` regenerated.

- [ ] **Step 2: GUI smoke test (run by the human, or driven via the verify skill)**

Run `npm run tauri dev` — it should now boot the Vite dev server (port 1420) via
`beforeDevCommand`, then open the window. Confirm **every** feature behaves exactly
as before the migration:
- [ ] Launch shows the rendered sample with syntax highlighting (themed).
- [ ] **⌘F find** highlights + navigates; **⌘⇧O outline** toggles + scroll-spy.
- [ ] **Copy-code** buttons copy.
- [ ] **Export as HTML** → save → the `.html` is a correct standalone **light** doc
  (re-inspect: contains `<!doctype html>`, `class="markdown-body"`, inlined CSS,
  light syntax) — confirms the `?raw` import matches the old fetch output.
- [ ] **Print** (⌘P) renders light/chrome-free.
- [ ] **View → Appearance** Light/Dark/System switches the whole UI + persists.
- [ ] **Drag-drop** a `.md` opens it; **Open / Open Recent** work; **live-reload** on
  an external edit re-renders.
- [ ] No regressions vs the pre-Vite app.

- [ ] **Step 3: Commit any tweaks**

```bash
git add -A
git commit -m "test: verify Vite migration" --allow-empty
```
