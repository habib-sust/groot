# Export to HTML + Print/PDF — Design

**Date:** 2026-06-04
**Status:** Approved
**Project:** `groot` — lightweight Markdown viewer (Tauri v2 + Rust).
**Builds on:** the merged viewer on `main`.

## Goal

Let the user export the current document as a self-contained **HTML** file and
**print** it (the macOS print panel offers "Save as PDF"). Both outputs always use
a light/neutral theme regardless of the app's current appearance.

## Scope

### In scope
- File menu: **Export as HTML…** and **Print…** (⌘P).
- HTML export: a self-contained `.html` (rendered body + inlined light CSS + light
  syntax colors), saved via a native save dialog.
- Print: `window.print()` with a `@media print` stylesheet forcing light/neutral and
  hiding app chrome; code prints in light syntax colors.

### Out of scope (deferred)
- Headless/programmatic PDF generation, page headers/footers, export-selection,
  user-chosen export theme.

## A. Triggers (Rust — `menu.rs`)
Add to the File submenu, after Open Recent (behind a separator):
- **Export as HTML…** — id `export_html`.
- **Print…** — id `print`, accelerator `CmdOrCtrl+P`.
`handle_menu_event` arms:
- `"export_html" => { let _ = app.emit("export-html", ()); }`
- `"print" => { let _ = app.emit("print", ()); }`

## B. Print → PDF (frontend + CSS)
- `src/main.js`: `listen("print", () => window.print())`.
- `src/styles.css` `@media print { … }`:
  - Force the light palette on `:root` (so dark-mode users still print light):
    re-declare the light variables (`--bg`, `--fg`, `--code-bg`, etc.).
  - `#outline, #find-bar, .copy-btn { display: none !important; }`.
  - `#viewport { height: auto; overflow: visible; max-width: 100%; padding: 0; }`
    and `body { display: block; }` so content paginates normally.
- **Light code colors in print:** the live `#syntax-theme` style holds the *active*
  theme's colors (possibly dark). At startup the frontend injects a second
  `<style id="syntax-print">` containing `@media print { <syntax_css("light")> }`,
  appended AFTER `#syntax-theme` so the light rules win during printing (equal
  specificity, later source order).

## C. Export as HTML (frontend builds, Rust saves)
- `src/main.js` tracks `currentPath` (set in `openPath`).
- `listen("export-html")` → `exportHtml()`:
  - `css = await (await fetch("styles.css")).text() + "\n" + await invoke("syntax_css", { theme: "light" })`.
  - `body`: clone `#viewport`, remove all `.copy-btn`, take `innerHTML`.
  - `name`: `currentPath` base name with `.md`→`.html`, else `untitled.html`.
  - `await invoke("export_html", { body, css, name })`.
- Rust `export.rs`:
  - `pub fn wrap_html(css: &str, body: &str) -> String` — pure; returns a full
    `<!doctype html><html><head><meta charset><style>{css}</style></head>
    <body class="markdown-body">{body}</body></html>`. No `data-theme` attribute, so
    the light `:root` applies. Unit-tested.
  - `#[tauri::command] export_html(app, body: String, css: String, name: String)`:
    builds the doc via `wrap_html`, opens a save dialog (Rust `tauri-plugin-dialog`,
    `.add_filter("HTML", &["html"]).set_file_name(&name)`), and on a chosen path
    writes the doc with `std::fs::write`. Cancelled dialog → no-op. (Callback-based;
    the command returns once the dialog is shown.)
- `lib.rs`: `mod export;` and register `export::export_html` in the invoke handler.

## Data Flow
- **Print:** File→Print (⌘P) → Rust emits `print` → frontend `window.print()` →
  macOS panel (Save as PDF). The `@media print` CSS + light-syntax print style make
  it light + chrome-free.
- **Export HTML:** File→Export as HTML… → Rust emits `export-html` → frontend builds
  `{body, css, name}` → `invoke("export_html")` → Rust `wrap_html` + save dialog +
  write → a standalone light `.html`.

## Error / Edge Handling
- Save dialog cancelled → nothing written, no error surfaced.
- Write failure → ignored (best-effort) or logged; not fatal.
- No file open (sample) → `name` is `untitled.html`; the sample exports fine.
- Print in dark mode → forced light via `@media print`.

## Files
- `src-tauri/src/menu.rs` — File→Export/Print items + emit arms.
- `src-tauri/src/export.rs` — **new:** `wrap_html` (+test) + `export_html` command.
- `src-tauri/src/lib.rs` — `mod export`; register `export_html`.
- `src/main.js` — track `currentPath`; `print`/`export-html` listeners; inject
  print-syntax style once.
- `src/styles.css` — `@media print` block.

## Testing
- **Unit (Rust):** `wrap_html` — output contains `<!doctype html>`, the passed CSS,
  the passed body, `class="markdown-body"`, and no `data-theme`.
- Save dialog/write and `window.print()` are GUI-only — verified by exporting a doc
  and opening the `.html` in a browser, and by Print → Save as PDF. Rust build + 22
  existing tests stay green; `node --check src/main.js` passes.

## Acceptance Criteria
- File → Export as HTML… opens a save dialog; the saved `.html` opens in any browser
  and renders the document with light styling + light code highlighting (even if the
  app was in dark mode).
- File → Print… (⌘P) opens the print panel; the preview/output is light and excludes
  the outline, find bar, and copy buttons.
- `cargo test` passes (22 + the new `wrap_html` test); the Rust builds clean.
