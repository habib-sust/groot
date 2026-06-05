# WYSIWYG Editor — Slice B: Milkdown Crepe Surface — Design

**Date:** 2026-06-05
**Status:** Approved
**Project:** `groot` — Markdown viewer → editor (Tauri v2 + Rust, Vite frontend).
**Part of:** the WYSIWYG-editing epic. **All slices (B→C→D) land on one long-lived
branch `feat/wysiwyg-editor` and merge to `main` only when coherent**, so the
working viewer on `main` is never regressed mid-way.

## Editing epic (context)
- A. Vite migration — **done, merged.**
- **B. Crepe as the always-editable document surface** — this slice.
- C. Save / dirty-tracking / New file + live-reload-vs-edits reconciliation.
- D. Reintegrate find / outline / copy / export / print / themes around Crepe.

## Goal (Slice B)
Replace the read-only `parse_markdown → innerHTML` preview with **Milkdown Crepe**
as a single, always-editable WYSIWYG surface (Typora-style, no mode switch). Opening
a document loads its markdown into the editor; it renders as rich content and is
editable in place. In-memory only (no save — Slice C). Basic light/dark theming.

## Scope

### In scope
- Add `@milkdown/crepe` (Vite-bundled); mount it as the document surface in
  `#viewport`.
- `render(markdown)` loads content into Crepe (create/replace).
- Open flows (open-file event, Open Recent, drag-drop) + the launch SAMPLE load into
  the editor.
- Bridge Crepe's theme to the app's light/dark appearance.

### Out of scope (later slices; temporarily non-functional on this branch)
- find, outline, copy-code, export, print — they target the old read-only
  `#viewport` innerHTML and break when Crepe owns that DOM; **reintegrated in Slice D.**
- Save / dirty-tracking / New file; live-reload-vs-edit reconciliation (Slice C).

## Integration

### Dependency + import
- `npm install @milkdown/crepe` (Vite bundles it + its ProseMirror/Milkdown deps).
- `src/main.js` imports it as ES modules: `import { Crepe } from "@milkdown/crepe";`
  plus its theme CSS (e.g. `import "@milkdown/crepe/theme/common/style.css";` and a
  base theme such as `import "@milkdown/crepe/theme/frame.css";`). It continues to use
  the `window.__TAURI__` globals for IPC alongside these imports.
- The exact Crepe API (constructor options, `create()`, `destroy()`, content
  update/`replaceAll`, theme CSS entry points) is **version-sensitive** — the
  implementer verifies against the installed `@milkdown/crepe` version (its TS types
  / docs; context7 `/Milkdown` if needed) and adjusts, preserving behavior.

### Surface replacement
- `#viewport` becomes the Crepe **mount root** (it no longer receives
  `parse_markdown` innerHTML for the document). The `markdown-body` styling that
  applied to injected HTML no longer drives the surface (Crepe brings its own
  rendered structure + theme).
- A module-level `let crepe = null;`. `render(markdown)`:
  - `currentSource = markdown;`
  - if a Crepe instance exists, `await crepe.destroy()` (tear down cleanly);
  - create a fresh instance: `crepe = new Crepe({ root: viewport, defaultValue: markdown }); await crepe.create();`
  - (Destroy+recreate per open is the simple, correct content-load path for Slice B;
    a lighter in-place `replaceAll` update can come later if needed.)
- Crepe parses markdown and highlights code blocks itself, so **syntect /
  `parse_markdown` is no longer used for the surface**. The Rust `parse_markdown`
  command stays (tests pass; Slice D's export may reuse it); it's just unused by the
  new surface.

### Theming
- `applyTheme(eff)` additionally sets Crepe's appearance to match: bridge via the
  `data-theme` attribute already on `<html>` + overriding Crepe's CSS custom
  properties for dark, OR selecting Crepe's dark theme. Goal: the editor reads light
  in light mode and dark in dark mode, roughly matching the app palette. (Pixel-exact
  theme matching is polished in Slice D.)
- Keep a comfortable centered reading/writing column.

### Open / load flows
- `openPath` (dialog/Recent/drag-drop) still reads the file via `read_markdown_file`
  then calls `render(content)` → loads into Crepe; window title + Open Recent (Rust)
  unchanged.
- The launch SAMPLE is loaded into the editor via `render(SAMPLE)` on `DOMContentLoaded`.

## Error / Edge Handling
- Crepe create/destroy errors → caught; show a fallback message in `#viewport` (reuse
  `showError`) rather than crashing.
- `file-changed` (live-reload) during Slice B simply reloads the editor with the new
  content (may discard in-memory edits — acceptable pre-save; reconciled in Slice C).
- Empty document / SAMPLE → editor mounts empty/with sample; fine.

## Files (Slice B)
- `package.json` (+ lock) — add `@milkdown/crepe`.
- `src/main.js` — import Crepe + theme CSS; `render()` mounts/replaces Crepe;
  `applyTheme` bridges editor theme; SAMPLE loads into editor.
- `src/styles.css` — Crepe container sizing + light/dark theme bridge; keep the
  centered column.
- `src/index.html` — `#viewport` remains but is now the Crepe root (no behavioral
  markup change required beyond what main.js does).

## Testing
- Rust unchanged → `cargo test` stays green (23).
- `npm run build` succeeds (Crepe bundles); `node --check src/main.js` passes (or rely
  on the successful build, since it uses ESM imports).
- GUI smoke (the real check): `npm run tauri dev` → the launch sample appears as
  **editable rich content** (headings look like headings, list items, a highlighted
  code block), and typing edits it in place; opening a `.md` (drag-drop / Open Recent)
  loads it into the editor; light/dark appearance themes the editor. (find/outline/
  export/print are expected non-functional on this branch — reintegrated in D.)

## Acceptance Criteria
- The document surface is a single, always-editable Milkdown Crepe editor (no mode
  switch); opening a file shows its content as editable WYSIWYG and typing edits in
  place.
- The editor is themed light in light mode, dark in dark mode.
- `cargo test` passes (23); `npm run build` succeeds.
- (Accepted, temporary) find/outline/copy/export/print are non-functional until
  Slice D; this branch is not merged to `main` until they're reintegrated.
