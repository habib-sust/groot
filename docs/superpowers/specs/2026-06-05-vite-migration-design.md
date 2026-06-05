# Editing — Slice A: Vite Migration (behavior-identical) — Design

**Date:** 2026-06-05
**Status:** Approved
**Project:** `groot` — Markdown viewer → editor (Tauri v2 + Rust).
**Part of:** the WYSIWYG-editing program (Milkdown + bundler). This is the
foundation slice; no editing yet.

## Editing program (context)
- **A. Vite migration** — this slice: introduce a bundler, keep the app
  behaviorally identical. Unblocks ES-module libraries.
- B. Milkdown WYSIWYG document surface (in-place Typora-style editing).
- C. Save / dirty-tracking / New file (+ live-reload reconciliation).
- D. Reintegrate find / outline / export / themes around Milkdown.

## Goal (Slice A)
Introduce Vite as the frontend dev server + build step. The app must behave
**identically** — all existing viewer features keep working. The frontend keeps
using the `window.__TAURI__` globals (minimal change). The Rust backend is unchanged.

## Scope

### In scope
- Add Vite (dev dependency) + `dev`/`build` npm scripts + `vite.config.js`.
- Point `tauri.conf.json` at the Vite dev server + `dist/` build output.
- Fix the one thing that breaks under bundling: the export feature's
  `fetch("styles.css")` → a Vite `?raw` CSS import.
- `.gitignore` the `dist/` output.

### Out of scope
- Any editing / Milkdown (Slice B).
- Converting Tauri calls to `@tauri-apps/api` imports (stay on globals;
  `withGlobalTauri` remains true).
- Restructuring the `src/` layout beyond what Vite needs.

## Changes

### Vite setup
- `npm install --save-dev vite`.
- `package.json` scripts: `"dev": "vite"`, `"build": "vite build"`.
- `vite.config.js` at the repo root:
  ```js
  import { defineConfig } from "vite";

  export default defineConfig({
    root: "src",
    build: { outDir: "../dist", emptyOutDir: true },
    server: { port: 1420, strictPort: true },
    clearScreen: false,
  });
  ```
  The existing `src/index.html` is the Vite entry; `main.js` and `styles.css`
  resolve relative to `src/` exactly as now.

### tauri.conf.json (`build` section)
Change to:
```json
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  }
```
Keep `app.withGlobalTauri: true` so `main.js`'s `window.__TAURI__.core` / `.event`
usage is unchanged. (Previously `frontendDist` was `"../src"` with no dev server.)

### main.js (only code change)
The export builder currently does `const baseCss = await (await fetch("styles.css")).text();`.
Under a Vite build, `styles.css` is bundled/hashed and not fetchable by name.
Replace with a Vite raw import at the top of the module:
```js
import stylesText from "./styles.css?raw";
```
and in `exportHtml`, use `stylesText` instead of the fetch:
```js
    const css = `${stylesText}\n${codeCss}`;
```
The `<link rel="stylesheet" href="styles.css">` in `index.html` stays (Vite
processes it for the app's own styling). No other `main.js` changes — all Tauri
IPC stays on the globals.

### .gitignore
Add `dist/` (Vite build output). `node_modules/` is already ignored.

## Architecture / why it's safe
Vite becomes the dev server (port 1420, launched by Tauri's `beforeDevCommand`) and
the production bundler (`beforeBuildCommand` → `dist/`, served as `frontendDist`).
The frontend code is otherwise unchanged: Tauri globals are injected at runtime
regardless of bundler; injected `<style>` blocks, find/outline/copy/themes/
live-reload/menu wiring are all bundler-agnostic. The Rust backend and all commands
are untouched.

## Error / Edge Handling
- Export must still produce the same standalone light HTML (now sourced from the
  `?raw` import rather than fetch) — verified by re-exporting and inspecting.
- Vite dev server port 1420 is fixed (`strictPort`) to match `devUrl`.

## Files
- New: `vite.config.js`.
- Modify: `package.json` (devDep + scripts), `src-tauri/tauri.conf.json` (build),
  `src/main.js` (export CSS import), `.gitignore` (`dist/`).

## Testing
- Rust unchanged → `cargo test` still passes (23).
- `node --check src/main.js`.
- `npm run build` completes and produces `dist/` (with `index.html` + bundled
  assets) without errors.
- GUI smoke (the real check): `npm run tauri dev` boots Vite + the window, and
  **every existing feature still works identically**:
  render + syntect highlighting, ⌘F find, ⌘⇧O outline + scroll-spy, copy-code
  buttons, **Export as HTML (re-inspect the output)**, Print, View→Appearance
  (light/dark/system), drag-drop open, live-reload on external change, Open / Open
  Recent.

## Acceptance Criteria
- `npm run tauri dev` launches the app via the Vite dev server; the window and all
  features behave exactly as before the migration.
- `npm run build` produces a working `dist/` bundle; a Tauri build/run from it works.
- Export still yields a correct standalone light `.html`.
- `cargo test` passes (23); the Rust backend is unchanged.
