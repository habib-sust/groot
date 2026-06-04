# Edit Menu + Recent Auto-Pruning + Syntax Highlighting — Design

**Date:** 2026-06-04
**Status:** Approved
**Project:** `groot` — lightweight Markdown viewer (Tauri v2 + Rust).
**Builds on:** [native File menu + Open Recent](./2026-06-04-native-file-menu-open-recent-design.md)

## Goal

Three increments to the viewer:
1. **Edit menu** — restore standard Copy / Select All shortcuts displaced by the custom native menu.
2. **Recent auto-pruning** — drop "Open Recent" entries whose files no longer exist.
3. **Syntax highlighting** — highlight fenced code blocks, Rust-side via `syntect`.

## Scope

### In scope
- An **Edit** submenu (Copy ⌘C, Select All ⌘A) in the native menu.
- Pruning of non-existent recent files at startup and on a failed recent-item open.
- syntect-based, class-based syntax highlighting of fenced code blocks in `parse_markdown`.
- A `syntax_css()` command returning light + dark theme CSS, injected by the frontend.

### Out of scope (deferred)
- Cut/Paste menu items (read-only viewer).
- Per-language theme overrides, line numbers, copy-code button, user-configurable themes.
- "On every menu rebuild" existence re-checks (we prune at startup + on failed open only).

## Part A — Edit menu

Add an **Edit** submenu to `build_app_menu` in `src-tauri/src/menu.rs`, placed between the app submenu and the File submenu, containing predefined **Copy** (⌘C) and **Select All** (⌘A) items via `PredefinedMenuItem::copy(app, None)` and `PredefinedMenuItem::select_all(app, None)`. No new state or events. Cut/Paste are intentionally omitted (the viewer is read-only).

## Part B — Recent auto-pruning

### `recent_files.rs` (new pure methods, unit-testable)
- `remove(&mut self, path: &Path)` — remove any entry equal to `path`.
- `prune_with(&mut self, keep: impl FnMut(&PathBuf) -> bool)` — retain only entries for which `keep` returns true. Pure: existence-checking is injected by the caller as the predicate, so tests need no filesystem.

### Startup pruning (`lib.rs`)
After `RecentFiles::load(&store_path)`, call `recent.prune_with(|p| p.exists())`, then `save` the cleaned list, then build the menu. A file deleted between sessions disappears from the list at next launch.

### Failed-open pruning (`menu.rs`)
In the recent-item click arm of `handle_menu_event` (the catch-all `path =>` arm), check `Path::new(path).exists()`:
- **Missing:** `remove` it from the store, persist, rebuild + set the menu, and emit an **`open-error`** event whose payload is a human-readable message (e.g. `"File no longer exists: <path>"`).
- **Present:** proceed as today (`on_file_chosen`: add to front, persist, rebuild, emit `open-file`).

The Open-File dialog only returns existing files, so its path needs no pruning.

### Frontend
`src/main.js` adds a listener for `open-error` that calls the existing `showError(event.payload)`.

## Part C — Syntax highlighting

### `parse_markdown` rewrite (`markdown.rs`)
Replace the plain `html::push_html` call with an event-driven render:
- Iterate `pulldown_cmark::Parser` events.
- On `Event::Start(Tag::CodeBlock(CodeBlockKind::Fenced(lang)))`, begin capturing; collect subsequent `Event::Text` into a code buffer until `Event::End` of the code block; then highlight the buffered code with syntect and push the resulting HTML as raw HTML into the output stream.
- All other events render normally (reuse pulldown-cmark's HTML writer for non-code events).
- Tables and strikethrough options remain enabled (as today).

Highlighting uses syntect's `ClassedHTMLGenerator` with `ClassStyle::Spaced` and `SyntaxSet::load_defaults_newlines()`:
- Resolve the language via `syntax_set.find_syntax_by_token(lang)`; if the language is empty/unknown, fall back to `find_syntax_plain_text()`.
- Feed each line through `parse_html_for_line_which_includes_newline`; on any error, fall back to emitting an escaped plain `<pre><code>…</code></pre>` block. `parse_markdown` must never return `Err` for normal input.
- Output is wrapped so the result is a `<pre><code class="…">…</code></pre>` (or syntect's standard `<pre>`-wrapped classed output).

### Sanitization
Replace the bare `ammonia::clean(&rendered)` with an `ammonia::Builder` that starts from defaults and additionally allows the `class` attribute on `span`, `pre`, and `code` (via `add_tag_attributes`), and ensures `span` is an allowed tag. The script-stripping guarantee is unchanged — class names cannot execute. Build the cleaner once per call (or lazily); apply to the full rendered HTML.

### Theme CSS — `syntax_css()` command
A new `#[tauri::command] syntax_css() -> String` that returns concatenated CSS:
- Light theme: `ThemeSet::load_defaults().themes["InspiredGitHub"]` via `css_for_theme_with_class_style(theme, ClassStyle::Spaced)`.
- Dark theme: `themes["base16-ocean.dark"]`, same call, wrapped in `@media (prefers-color-scheme: dark) { … }`.
Both use the same class names; only the color rules differ. Register the command in `lib.rs`'s `invoke_handler`.

### Frontend integration (`src/main.js`)
On startup, `invoke("syntax_css")` and inject the returned CSS into a `<style id="syntax-theme">` appended to `<head>` (created via `document.createElement`), before/independent of the first render. This is the app's own generated CSS — not user content — so injection is safe. The existing sample render and file-open flows are otherwise unchanged (they already call `parse_markdown`).

### Dependency
Add `syntect` to `src-tauri/Cargo.toml`.

## Data Flow (highlighting)
Launch → frontend `invoke("syntax_css")` → inject `<style>`; render SAMPLE via `parse_markdown` (highlighted). Open File / Open Recent → `parse_markdown` → highlighted HTML injected into `#viewport`.

## Error Handling
- Unknown/missing code-block language → plain text fallback (no highlight, no crash).
- Any syntect error → escaped plain `<pre><code>` fallback; `parse_markdown` never errors on input.
- Missing recent file on click → pruned + `open-error` shown via `showError`.
- Corrupt recents JSON → empty list (unchanged).

## Testing
### `recent_files.rs` (pure unit tests)
- `remove` deletes the matching entry and leaves others.
- `prune_with` retains only predicate-approved entries (e.g. keep a set, drop the rest) — no filesystem needed.

### `markdown.rs` (unit tests)
- A ```` ```rust ```` fenced block yields classed `<span ` markup in the output.
- A fenced block with **no** language still yields a `<pre>`/`<code>` block.
- An **unknown** language (e.g. ```` ```nosuchlang ````) does not panic and renders the code text.
- `<script>` in input is still absent from output (sanitization regression).
- `syntax_css()` returns non-empty CSS that contains a `prefers-color-scheme: dark` block.

### GUI smoke test (human)
- Edit menu shows Copy + Select All; ⌘A selects, ⌘C copies in the viewport.
- A code block renders with colors in both light and dark OS appearance.
- Deleting a recent file then relaunching removes it from Open Recent; clicking a recent whose file was deleted while running shows an error and removes it from the menu.

## Acceptance Criteria
- The native menu has an **Edit** menu with working Copy + Select All.
- Recent entries for deleted files are pruned at startup and on failed open (with an error shown).
- Fenced code blocks are syntax-highlighted, themed for light and dark.
- `parse_markdown` still strips `<script>` and never errors on normal input.
- `cargo test` passes (existing tests + new `recent_files` and `markdown` highlighting tests).
