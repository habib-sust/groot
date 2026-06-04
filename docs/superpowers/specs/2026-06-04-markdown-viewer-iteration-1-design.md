# Markdown Viewer — Iteration 1 Design

**Date:** 2026-06-04
**Status:** Approved
**Project:** `groot` — a lightweight Markdown desktop application inspired by [MarkText](https://github.com/marktext/marktext).

## Goal

Deliver a working **Markdown viewer** (no editing) as a desktop app built with a
**Rust backend** and the **Tauri v2** framework. Iteration 1 proves the full
`frontend → IPC → pulldown-cmark → DOM` pipeline and delivers a genuinely useful
viewer that can open and render real `.md` files from disk.

## Scope

### In scope
- Initialize the Tauri v2 project structure (vanilla HTML/CSS/JS frontend).
- A Rust command `parse_markdown` that converts a raw markdown string to
  sanitized HTML using `pulldown-cmark` + `ammonia`.
- A Rust command `read_markdown_file` that reads a file from disk and returns its
  raw contents.
- A minimal single-viewport frontend layout with an "Open File" control.
- The IPC bridge so the frontend can pass markdown to Rust and inject the
  returned HTML into the DOM.
- A built-in sample markdown string rendered on launch.
- Rust unit tests for the pure parsing/sanitization logic.

### Out of scope (deferred to later iterations)
- Editing capabilities of any kind.
- Syntax highlighting of code blocks.
- Drag-and-drop file loading.
- Multiple tabs / multiple open files.
- File watching / live reload.
- Persistence, settings, or themes beyond a basic light/dark default.

## Architecture Overview

A Tauri v2 desktop app. The webview hosts a vanilla HTML/CSS/JS frontend with a
single scrollable viewport. The Rust backend exposes IPC commands; the core one,
`parse_markdown`, converts a markdown string to sanitized HTML. The frontend
injects that HTML into the viewport's DOM.

### Data flow

**Phase 1 — On launch (proves the pipeline):**
1. Frontend holds a built-in sample markdown string.
2. Frontend calls `invoke("parse_markdown", { content })`.
3. Rust parses + sanitizes, returns HTML.
4. Frontend injects HTML into `#viewport`.

**Phase 2 — On "Open File" (the real viewer):**
1. User clicks "Open File".
2. Frontend opens the OS file dialog via `@tauri-apps/plugin-dialog`, filtered to
   `.md` / `.markdown`, and receives a file path.
3. Frontend calls `invoke("read_markdown_file", { path })` → Rust reads the file
   via `std::fs` and returns the raw markdown.
4. Frontend calls `invoke("parse_markdown", { content })` → returns sanitized HTML.
5. Frontend injects HTML into `#viewport`.

The file dialog runs in JS, so Rust only ever receives a path. This keeps the
permission surface minimal: only the **dialog** permission is required (Rust reads
the chosen path directly with `std::fs`; no broad fs-plugin access).

## Rust Backend — Commands

Each command is a small, single-purpose, independently testable unit.

### `parse_markdown(content: String) -> Result<String, String>`
The pure core. No I/O.
1. Parse `content` with `pulldown-cmark` (raw HTML enabled so inline HTML is
   preserved into the output stream).
2. Render to an HTML string.
3. Run the HTML through `ammonia::clean()` to strip scripts and dangerous
   attributes.
4. Return the sanitized HTML.

Returns `Err(String)` only in the unlikely event of an internal failure; markdown
parsing itself does not fail on malformed input (it degrades gracefully).

### `read_markdown_file(path: String) -> Result<String, String>`
Reads a file from disk via `std::fs::read_to_string`. Returns the raw markdown on
success, or a human-readable error string (e.g. file not found, permission denied,
invalid UTF-8) on failure. Keeps file I/O separate from parsing so the same parse
path is reused everywhere.

## Folder Structure

```
groot/
├── index.html                 # webview entry, single #viewport + "Open File" button
├── package.json               # vite + @tauri-apps/cli + plugin-dialog
├── vite.config.js
├── src/
│   ├── main.js                # invoke() calls, dialog, DOM injection, error display
│   └── styles.css             # app chrome + GitHub-like markdown typography
├── src-tauri/
│   ├── Cargo.toml             # pulldown-cmark, ammonia, tauri, plugin-dialog
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── capabilities/
│   │   └── default.json       # dialog permission only
│   ├── icons/
│   └── src/
│       ├── main.rs            # thin: calls lib run()
│       ├── lib.rs             # Builder, register commands, register plugins
│       └── markdown.rs        # parse_markdown + read_markdown_file + #[cfg(test)] tests
└── docs/superpowers/specs/    # this design doc
```

## Frontend

`index.html`: a minimal layout — a small top bar with an "Open File" button and a
single scrollable `#viewport` container below it.

`src/main.js`:
- On `DOMContentLoaded`, render the built-in sample string (Phase 1).
- Wire the "Open File" button to the dialog → read → parse → inject flow (Phase 2).
- Centralize a single `render(markdown)` helper that calls `parse_markdown` and
  injects the result, plus a `showError(message)` helper.

`src/styles.css`: clean, readable GitHub-flavored markdown typography (headings,
paragraphs, lists, blockquotes, tables, inline code, `<pre>` code blocks). Code
blocks render as plain monospace (no syntax highlighting). Light/dark via
`prefers-color-scheme` included only if trivial.

## Error Handling

Both Rust commands return `Result<_, String>`. The frontend wraps each `invoke()`
in try/catch. On error (unreadable file, internal parse failure), the frontend
calls `showError()` to render a readable message **into the viewport itself**, so
failures are visible rather than silent.

## Testing

Rust `#[cfg(test)]` unit tests in `markdown.rs`, run with `cargo test` (no Tauri
runtime required, since the functions are pure / I/O-isolated):
- Heading and paragraph markdown converts to the expected HTML tags.
- A fenced code block converts to a `<pre><code>` block.
- **Sanitization:** a `<script>` tag in the input is absent from the output.
- `read_markdown_file` returns `Err` for a non-existent path.

## Initial Setup Commands

```bash
# Scaffold Tauri v2 vanilla template into the current repo
npm create tauri-app@latest . -- --template vanilla --manager npm

# Add Rust deps
cd src-tauri && cargo add pulldown-cmark ammonia tauri-plugin-dialog && cd ..

# Add JS dialog plugin
npm install @tauri-apps/plugin-dialog

# Run it
npm run tauri dev
```

## Acceptance Criteria

- `npm run tauri dev` launches a desktop window that immediately shows the
  rendered sample markdown.
- Clicking "Open File" opens a native dialog, and selecting a `.md` file renders
  its contents as HTML in the viewport.
- A markdown file containing a `<script>` tag does not execute script in the
  webview (sanitized away).
- An unreadable/missing file shows a visible error message in the viewport.
- `cargo test` passes in `src-tauri`.
