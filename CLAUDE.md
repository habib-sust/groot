# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`groot` is a lightweight Markdown desktop app (Tauri v2): a Rust backend + a Vite-bundled vanilla-JS frontend whose document surface is a **Milkdown Crepe** in-place WYSIWYG editor.

## Commands

`cargo` is **not on the default PATH** — invoke it as `~/.cargo/bin/cargo`, or prefix PATH for the dev server.

- **Run the app (dev):** `PATH="$HOME/.cargo/bin:$PATH" npm run tauri dev` — Tauri spawns Vite (`beforeDevCommand`) on port 1420, then launches the native window.
- **Frontend build:** `npm run build` — Vite builds `src/` → `dist/`. This is the authoritative syntax/bundle check (ESM imports resolve here); there is **no JS unit-test harness**.
- **Rust tests:** `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml` — run a single test by appending its name, e.g. `... cargo test write_file_roundtrips`.
- **Rust type-check:** `~/.cargo/bin/cargo check --manifest-path src-tauri/Cargo.toml` — also recompiles `src-tauri/capabilities/*.json`, so use it after changing permissions.

## Architecture

**Two halves, one contract.** The Rust backend owns the native menu, the filesystem, file watching, and persistence; the frontend owns the editor and all in-document UI. They communicate two ways:

- **Menu/OS → frontend via events.** `src-tauri/src/menu.rs` builds the native menu and `emit()`s events the frontend `listen()`s for: `open-file`, `open-error`, `new-file`, `save`, `save-as`, `find`, `toggle-outline`, `export-html`, `print`, `appearance-changed`, `close-requested`, plus `file-changed` (from the watcher). To add a menu-driven feature you add the item + `emit` in `menu.rs` and a `listen` handler in `src/main.js` — there is no other coupling.
- **Frontend → backend via `invoke`.** Registered commands (see `generate_handler!` in `src-tauri/src/lib.rs`): `parse_markdown(content)`, `read_markdown_file(path)`, `syntax_css(theme)` (markdown.rs); `export_html(body, css, name)` (export.rs); `write_file(path, content)`, `save_file_as(content, suggested_name)` (fileops.rs); `get_appearance`, `set_window_title`, `close_main_window` (lib.rs).

`withGlobalTauri: true` — the frontend uses `window.__TAURI__.core.invoke` / `window.__TAURI__.event.listen` (no `@tauri-apps/api` imports for those).

**The editor surface.** `src/main.js`'s `render(markdown)` destroys and recreates a Crepe instance mounted in `#viewport` (Crepe is ProseMirror-based and owns that DOM entirely). Because every load recreates the editor, features that anchor to the DOM must re-attach inside `render()` (find highlights are cleared+re-run, outline is rebuilt). Dirty state is tracked via Crepe's `markdownUpdated`; the window title (frontend-owned) shows a `•` when dirty.

**Export & Print never scrape the live editor DOM** (it's full of contenteditable/cursor/toolbar chrome). Both re-render from `crepe.getMarkdown()` → `parse_markdown` (pulldown-cmark + syntect highlighting, ammonia-sanitized) → clean HTML. Export hands that to `export_html`; Print injects it into a hidden `#print-container` that `@media print` rules reveal while hiding `#viewport`.

**Rust modules** (each focused): `markdown.rs` (parse + syntect CSS), `export.rs` (standalone-HTML wrap + save dialog), `fileops.rs` (write / save-as), `recent_files.rs` + `appearance.rs` (JSON persistence under the app data dir, managed as `Mutex` state), `watcher.rs` (notify-debouncer → `file-changed` for live reload), `menu.rs` (menu build + event dispatch).

## Gotchas

- **Blocking dialog commands must be `async`.** A synchronous `#[tauri::command]` runs on the **main thread**; calling `blocking_save_file()` there freezes the UI. `save_file_as` is `async` for exactly this reason (see the comment in `fileops.rs`). Note `export_html` instead uses the non-blocking `.save_file(callback)` form.
- **Print uses `window.print()`** — on macOS Tauri overrides it to invoke the native `plugin:webview|print` command. This requires the `core:webview:allow-print` permission in `src-tauri/capabilities/default.json`. There is no `getCurrentWebviewWindow().print()` method in `@tauri-apps/api` 2.11.
- **Crepe theming** is bridged in `src/styles.css`: the `#viewport .milkdown` block maps `--crepe-color-*` to the app's palette tokens (`--bg`, `--fg`, etc.), which themselves switch on `:root[data-theme]`. One block themes both light and dark. The caret is a *virtual cursor* (`--prosemirror-virtual-cursor-color`), overridden to `--fg` so it stays visible.
- **`parse_markdown`'s parameter is `content`**, not `markdown` — `invoke("parse_markdown", { content })`.
- **Exported HTML** is wrapped by Rust `wrap_html` as `<body class="markdown-body">`; the `body.markdown-body` rule in `styles.css` neutralizes the app shell's `body { display: flex }` for the standalone document. Don't add an extra `.markdown-body` wrapper in JS.

## Workflow

This project is developed via the `superpowers` skill workflow: brainstorm → spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) → subagent-driven implementation → review. Specs and plans for completed work live in those directories and are useful context for how a feature was intended to work.
