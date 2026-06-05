# groot

A lightweight Markdown desktop app with an in-place **WYSIWYG editor** — write and read Markdown as rendered rich text, no split-pane source/preview, no mode switch. Built with Tauri v2 (Rust) and a Milkdown Crepe editing surface.

## Features

- **In-place WYSIWYG editing** — Markdown renders as you type (headings, lists, tables, fenced code with syntax highlighting); no raw-symbol mode switching.
- **Open** via the File menu, **Open Recent** (persisted), or **drag-and-drop** a `.md` file onto the window.
- **Save / Save As / New** with unsaved-changes tracking (a `•` in the title) and a close guard that prompts before discarding edits.
- **Live reload** — external changes to the open file are picked up automatically (and ignored while you have unsaved edits).
- **Find** in-document (⌘F), **Outline** sidebar with scroll-spy (⌘⇧O), and per-code-block **Copy**.
- **Export as HTML** and **Print / PDF** — both render a clean standalone document (no editor chrome).
- **Themes** — warm-cream light and slate dark, with a System option that follows the OS; persisted across launches.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Open File | ⌘O |
| New | ⌘N |
| Save | ⌘S |
| Save As | ⌘⇧S |
| Find | ⌘F |
| Toggle Outline | ⌘⇧O |
| Print | ⌘P |

## Tech stack

- **[Tauri v2](https://tauri.app/)** — native shell + Rust backend.
- **Rust backend** — Markdown parsing ([`pulldown-cmark`](https://github.com/raphlinus/pulldown-cmark)), HTML sanitization ([`ammonia`](https://github.com/rust-ammonia/ammonia)), syntax highlighting ([`syntect`](https://github.com/trishume/syntect)), file watching ([`notify`](https://github.com/notify-rs/notify)).
- **Frontend** — Vite-bundled vanilla JS/CSS with the [Milkdown Crepe](https://milkdown.dev/) (ProseMirror) editor.

## Development

Requires [Rust](https://www.rust-lang.org/tools/install) and [Node.js](https://nodejs.org/).

```bash
npm install
npm run tauri dev      # launches the app (Vite + Tauri)
```

If `cargo` is not on your `PATH`, prefix the command: `PATH="$HOME/.cargo/bin:$PATH" npm run tauri dev`.

Other useful commands:

```bash
npm run build                                                   # build the frontend (Vite → dist/)
~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml    # run the Rust tests
npm run tauri build                                             # produce a distributable bundle
```

## Project layout

```
src/                 Frontend — index.html, main.js (editor + IPC), styles.css
src-tauri/src/       Rust backend — markdown, export, fileops, recent_files,
                     appearance, watcher, menu, lib (command registration)
docs/superpowers/    Design specs and implementation plans
```

See [CLAUDE.md](CLAUDE.md) for the frontend↔backend contract (menu events + `invoke` commands) and architectural notes.
