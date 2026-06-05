# WYSIWYG Slice D (Reintegrate find / outline / copy / export / print + theme) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore find / outline / copy-code / export / print around the Milkdown Crepe editor and unify light/dark theming, making `feat/wysiwyg-editor` coherent and ready to merge to `main`.

**Architecture:** Frontend-only. Export and Print re-render from `crepe.getMarkdown()` through the existing Rust `parse_markdown` (syntect-highlighted, ammonia-sanitized HTML) + `syntax_css`, never by scraping the editable ProseMirror DOM. Find keeps its CSS-Custom-Highlight overlay (re-run on reload). Outline rebuilds on load and ~300ms-debounced on edit. Copy-code is delegated to Crepe's built-in code-block button (our injector is deleted). Theming bridges Crepe's `--crepe-color-*` variables to the app's existing palette tokens (which already switch by `data-theme`), so one block themes both modes.

**Tech Stack:** Vite, Tauri v2, `@milkdown/crepe` (ProseMirror), vanilla JS/CSS. Rust unchanged.

## ⚠️ Notes for the implementer
- Use `~/.cargo/bin/cargo` (cargo is NOT on the default PATH). Branch is `feat/wysiwyg-editor`.
- **No Rust changes.** Verified command signatures you will call from JS:
  - `parse_markdown(content: String) -> Result<String,String>` → invoke as `invoke("parse_markdown", { content })`. **The arg name is `content`, not `markdown`.**
  - `syntax_css(theme: String) -> String` → `invoke("syntax_css", { theme })`.
  - `export_html(app, body, css, name)` → `invoke("export_html", { body, css, name })`. Its Rust `wrap_html` **already** emits `<body class="markdown-body">{body}</body>`, so pass the parsed HTML as `body` directly — do **not** wrap it in another `.markdown-body` element.
- There is **no JS unit-test harness** in this project (prior slices verified via build + GUI). `npm run build` (Vite) is the authoritative syntax/bundle check; GUI smoke is the real behavioral check. Rust `cargo test` must stay green (24 tests) since Rust is untouched.
- All code below targets the current `src/main.js` and `src/styles.css` as they exist on this branch.

## File Structure
- `src/main.js` — remove `addCopyButtons`; add `renderCleanHtml()` helper; rewrite `exportHtml()`; add `printDocument()`; re-wire find re-run + live outline into `render()` and the `markdownUpdated` listener; rebuild outline on open.
- `src/styles.css` — remove dead `.copy-btn` rules; replace the dark-only `.milkdown` bridge with a single token-based bridge covering both themes; update the `@media print` block to hide the live editor and print a clean `#print-container`; add the screen-hidden `#print-container` rule.
- `src/index.html` — no change (the print container is created in JS).
- Rust — no change.

---

## Task 1: Remove our copy-code injector (Crepe provides its own)

**Files:**
- Modify: `src/main.js` (delete `addCopyButtons`, lines ~74–95)
- Modify: `src/styles.css` (delete `.copy-btn` rules ~142–166; drop `.copy-btn` from the print hide list ~304)

- [ ] **Step 1: Delete the `addCopyButtons` function from `src/main.js`**

Remove the entire function (it injected a button into `<pre>` elements Crepe no longer emits, and is already not called from `render`):
```js
function addCopyButtons() {
  for (const pre of viewport.querySelectorAll("pre")) {
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.type = "button";
    btn.textContent = "Copy";
    btn.addEventListener("click", async () => {
      const code = pre.querySelector("code");
      const text = code ? code.innerText : pre.innerText;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "Copied!";
      } catch {
        btn.textContent = "Failed";
      }
      setTimeout(() => {
        btn.textContent = "Copy";
      }, 1500);
    });
    pre.appendChild(btn);
  }
}
```

- [ ] **Step 2: Confirm it is not referenced anywhere**

Run: `grep -n "addCopyButtons\|copy-btn" src/main.js`
Expected: **no matches** in `src/main.js` (the function is gone and was already uncalled).

- [ ] **Step 3: Delete the `.copy-btn` CSS rules from `src/styles.css`**

Remove these three rule blocks (around lines 142–166) in full:
```css
.copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  font: inherit;
  font-size: 0.72em;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg);
  color: var(--muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.markdown-body pre:hover .copy-btn,
.copy-btn:focus {
  opacity: 1;
}

.copy-btn:hover {
  color: var(--fg);
  border-color: var(--link);
}
```

- [ ] **Step 4: Remove `.copy-btn` from the print hide list**

In the `@media print` block, change:
```css
  #outline,
  #find-bar,
  .copy-btn {
    display: none !important;
  }
```
to:
```css
  #outline,
  #find-bar {
    display: none !important;
  }
```
(This list is rewritten more fully in Task 3; this step just removes the now-dead selector so the file is consistent if Task 3 is done later.)

- [ ] **Step 5: Verify no `.copy-btn` references remain**

Run: `grep -rn "copy-btn" src/`
Expected: **no matches**.

- [ ] **Step 6: Build**

Run: `npm run build 2>&1 | tail -6`
Expected: builds clean (no errors).

- [ ] **Step 7: Commit**

```bash
git add src/main.js src/styles.css
git commit -m "refactor: drop custom copy-code injector; Crepe code blocks provide their own"
```

---

## Task 2: Export — re-render from markdown into clean HTML

**Files:**
- Modify: `src/main.js` (add `renderCleanHtml()`; rewrite `exportHtml()`, ~397–413)

- [ ] **Step 1: Add the `renderCleanHtml()` helper**

In `src/main.js`, in the `// ---- Export / Print ----` section (just above `exportHtml`), add:
```js
// Render the current document to clean, sanitized, syntect-highlighted HTML via
// the Rust pipeline (not by scraping the editable DOM). Shared by Export + Print.
async function renderCleanHtml() {
  const md = crepe ? crepe.getMarkdown() : currentSource;
  const bodyHtml = await invoke("parse_markdown", { content: md });
  const codeCss = await invoke("syntax_css", { theme: "light" });
  return { bodyHtml, codeCss };
}
```

- [ ] **Step 2: Rewrite `exportHtml()` to use it**

Replace the existing `exportHtml` function:
```js
async function exportHtml() {
  try {
    const codeCss = await invoke("syntax_css", { theme: "light" });
    const css = `${stylesText}\n${codeCss}`;
    const clone = viewport.cloneNode(true);
    clone.querySelectorAll(".copy-btn").forEach((b) => b.remove());
    const body = clone.innerHTML;
    let name = "untitled.html";
    if (currentPath) {
      const base = currentPath.split("/").pop();
      name = `${base.replace(/\.(md|markdown)$/i, "")}.html`;
    }
    await invoke("export_html", { body, css, name });
  } catch (e) {
    showError(String(e));
  }
}
```
with:
```js
async function exportHtml() {
  if (!crepe) return;
  try {
    const { bodyHtml, codeCss } = await renderCleanHtml();
    const css = `${stylesText}\n${codeCss}`;
    let name = "untitled.html";
    if (currentPath) {
      name = `${basename(currentPath).replace(/\.(md|markdown)$/i, "")}.html`;
    }
    // wrap_html (Rust) already wraps body in <body class="markdown-body">,
    // so pass the parsed HTML directly — no extra wrapper element.
    await invoke("export_html", { body: bodyHtml, css, name });
  } catch (e) {
    showError(String(e));
  }
}
```

- [ ] **Step 3: Build**

Run: `npm run build 2>&1 | tail -6`
Expected: builds clean.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat: export re-renders document from markdown to clean HTML"
```

---

## Task 3: Print — print a clean render, not the live editor

**Files:**
- Modify: `src/main.js` (add `printDocument()`; change the `print` listener, ~415)
- Modify: `src/styles.css` (add screen-hidden `#print-container`; rewrite `@media print` block ~282–315)

- [ ] **Step 1: Add `printDocument()` and rewire the `print` listener**

In `src/main.js`, add the function in the Export/Print section (after `exportHtml`):
```js
async function printDocument() {
  try {
    const { bodyHtml } = await renderCleanHtml();
    const container = document.createElement("div");
    container.id = "print-container";
    container.className = "markdown-body";
    container.innerHTML = bodyHtml;
    document.body.appendChild(container);
    const cleanup = () => {
      container.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  } catch (e) {
    showError(String(e));
  }
}
```
Then change the listener line:
```js
listen("print", () => window.print());
```
to:
```js
listen("print", () => printDocument());
```
(Leave the existing `injectPrintSyntax()` / `#syntax-print` style as-is — it injects the light syntect CSS inside `@media print` at startup, which styles the `#print-container`'s code during printing.)

- [ ] **Step 2: Add the screen-hidden `#print-container` rule in `src/styles.css`**

Add this rule near the other top-level layout rules (e.g. just before the `@media print` block):
```css
/* Clean print render lives off-screen until printing (see @media print). */
#print-container {
  display: none;
}
```

- [ ] **Step 3: Rewrite the `@media print` block in `src/styles.css`**

Replace the current block (lines ~282–315) with one that hides the live editor + chrome and shows the clean container:
```css
@media print {
  /* Both selectors so the light print palette wins even when data-theme="dark"
     is set (equal specificity to :root[data-theme="dark"], later in source). */
  :root,
  :root[data-theme="dark"] {
    --bg: #ffffff;
    --fg: #24292f;
    --heading: #1f2328;
    --muted: #57606a;
    --border: #d0d7de;
    --rule: #d8dee4;
    --code-bg: #f6f8fa;
    --inline-code-bg: #eef1f3;
    --link: #2f4fd0;
  }

  body {
    display: block;
  }

  /* Hide the live editor and UI chrome; print the clean rendered container only. */
  #viewport,
  #outline,
  #find-bar,
  #unsaved-modal {
    display: none !important;
  }

  #print-container {
    display: block;
    max-width: 760px;
    margin: 0 auto;
    padding: 0;
  }
}
```

- [ ] **Step 4: Build**

Run: `npm run build 2>&1 | tail -6`
Expected: builds clean.

- [ ] **Step 5: Verify CSS braces balance**

Run: `node -e "const fs=require('fs');const c=fs.readFileSync('src/styles.css','utf8');const o=(c.match(/{/g)||[]).length,cl=(c.match(/}/g)||[]).length;if(o!==cl){console.error('brace mismatch',o,cl);process.exit(1)}console.log('css ok, braces',o)"`
Expected: `css ok, braces <N>`.

- [ ] **Step 6: Commit**

```bash
git add src/main.js src/styles.css
git commit -m "feat: print a clean re-rendered document instead of the live editor"
```

---

## Task 4: Find — re-run the overlay when the document reloads

**Files:**
- Modify: `src/main.js` (`render()`, ~97–118)

- [ ] **Step 1: Re-run find inside `render()` after Crepe is created**

In `render()`, after `dirty = false;` (inside the `try`, after the `crepe.on(...)` listener registration), add a find refresh. The function becomes:
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
    crepe.on((listener) =>
      listener.markdownUpdated(() => {
        dirty = true;
        updateTitle();
      })
    );
    dirty = false;
    // Find highlights are tied to the old DOM; clear and (if the bar is open) re-run.
    clearFindHighlights();
    if (findBar && !findBar.hidden) runSearch(findInput.value);
  } catch (e) {
    crepe = null;
    showError(String(e));
  }
}
```
(`clearFindHighlights`, `findBar`, `findInput`, and `runSearch` are module-scoped declarations later in the file; they are fully initialized by the time `render` is ever called — `render(SAMPLE)` runs from the deferred `DOMContentLoaded` handler, after the whole module has evaluated.)

- [ ] **Step 2: Build**

Run: `npm run build 2>&1 | tail -6`
Expected: builds clean.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat: refresh find overlay when the document reloads in the editor"
```

---

## Task 5: Outline — rebuild on load, on open, and debounced on edit

**Files:**
- Modify: `src/main.js` (`render()` ~97; `markdownUpdated` listener ~107; `toggleOutline()` ~304; add a debounce handle)

- [ ] **Step 1: Add a debounce handle near the outline state**

Find:
```js
const outline = document.querySelector("#outline");
let outlineObserver = null;
```
and add a debounce handle right after:
```js
const outline = document.querySelector("#outline");
let outlineObserver = null;
let outlineDebounce = null;
```

- [ ] **Step 2: Rebuild the outline on open in `toggleOutline()`**

Replace:
```js
function toggleOutline() {
  if (outline) outline.hidden = !outline.hidden;
}
```
with:
```js
function toggleOutline() {
  if (!outline) return;
  outline.hidden = !outline.hidden;
  if (!outline.hidden) buildOutline();
}
```

- [ ] **Step 3: Build the outline after each `render()` and debounce-rebuild on edit**

Update `render()` so the `markdownUpdated` callback also schedules a debounced outline rebuild, and call `buildOutline()` once after load. Building on the `render` from Task 4 plus this task, `render()` becomes:
```js
async function render(markdown) {
  currentSource = markdown;
  try {
    if (crepe) {
      await crepe.destroy();
      crepe = null;
    }
    clearTimeout(outlineDebounce);
    viewport.innerHTML = "";
    crepe = new Crepe({ root: viewport, defaultValue: markdown });
    await crepe.create();
    crepe.on((listener) =>
      listener.markdownUpdated(() => {
        dirty = true;
        updateTitle();
        // Keep the outline current while editing (only if it's visible).
        if (outline && !outline.hidden) {
          clearTimeout(outlineDebounce);
          outlineDebounce = setTimeout(buildOutline, 300);
        }
      })
    );
    dirty = false;
    clearFindHighlights();
    if (findBar && !findBar.hidden) runSearch(findInput.value);
    buildOutline();
  } catch (e) {
    crepe = null;
    showError(String(e));
  }
}
```
(`buildOutline`, `outline`, and `outlineDebounce` are hoisted/module-scoped and initialized before `render` runs. `buildOutline()` builds the heading list even when `#outline` is hidden — cheap and ready for the next open.)

- [ ] **Step 4: Build**

Run: `npm run build 2>&1 | tail -6`
Expected: builds clean.

- [ ] **Step 5: Commit**

```bash
git add src/main.js
git commit -m "feat: rebuild outline on load, on open, and debounced while editing"
```

---

## Task 6: Theme — one token-based Crepe bridge for both light and dark

**Files:**
- Modify: `src/styles.css` (replace the `:root[data-theme="dark"] .milkdown` block ~377–395 with a token-based `#viewport .milkdown` block; keep the existing height + cursor rules)

- [ ] **Step 1: Replace the dark-only bridge with a unified token bridge**

The app's palette tokens (`--bg`, `--fg`, `--heading`, `--muted`, `--border`, `--link`, `--accent`, `--code-bg`, `--inline-code-bg`, `--callout-bg`, `--callout-border`) are already defined for **both** themes on `:root` and `:root[data-theme="dark"]`. Mapping Crepe's variables to those tokens themes the editor in both modes from one block.

Find the existing dark bridge:
```css
:root[data-theme="dark"] .milkdown {
  --crepe-color-background: #2e3138;
  --crepe-color-on-background: #c8c4bb;
  --crepe-color-surface: #2e3138;
  --crepe-color-surface-low: #272a30;
  --crepe-color-on-surface: #c8c4bb;
  --crepe-color-on-surface-variant: #9a968d;
  --crepe-color-outline: #3a3f47;
  --crepe-color-primary: #d98c9a;
  --crepe-color-secondary: #3a3f47;
  --crepe-color-on-secondary: #c8c4bb;
  --crepe-color-inverse: #c8c4bb;
  --crepe-color-on-inverse: #2e3138;
  --crepe-color-inline-code: #d98c9a;
  --crepe-color-inline-area: #3a3e44;
  --crepe-color-error: #ff6b6b;
  --crepe-color-hover: #3a3f47;
  --crepe-color-selected: #3a3f47;
}
```
and **replace it** with a token-based bridge (note the selector changes to `#viewport .milkdown`, which applies in both themes; the tokens themselves switch by `data-theme`):
```css
/* Bridge Crepe's palette to the app tokens, which switch by data-theme, so the
   editor reads cohesively in BOTH light (warm cream) and dark (slate) modes. */
#viewport .milkdown {
  --crepe-color-background: var(--bg);
  --crepe-color-on-background: var(--fg);
  --crepe-color-surface: var(--bg);
  --crepe-color-surface-low: var(--code-bg);
  --crepe-color-on-surface: var(--fg);
  --crepe-color-on-surface-variant: var(--muted);
  --crepe-color-outline: var(--border);
  --crepe-color-primary: var(--link);
  --crepe-color-secondary: var(--border);
  --crepe-color-on-secondary: var(--fg);
  --crepe-color-inverse: var(--fg);
  --crepe-color-on-inverse: var(--bg);
  --crepe-color-inline-code: var(--link);
  --crepe-color-inline-area: var(--inline-code-bg);
  --crepe-color-error: #d9534f;
  --crepe-color-hover: var(--callout-bg);
  --crepe-color-selected: var(--callout-bg);
}
```

- [ ] **Step 2: Confirm the height + cursor rules are intact**

The two existing rules above the bridge must remain (do not delete them):
```css
#viewport .milkdown {
  height: 100%;
}
```
and
```css
#viewport .milkdown .ProseMirror-focused {
  --prosemirror-virtual-cursor-color: var(--crepe-color-on-background);
}
```
(The cursor rule now resolves to `var(--fg)` via the bridge — still high-contrast in both themes.)

Run: `grep -n "ProseMirror-focused\|#viewport .milkdown {\|height: 100%" src/styles.css`
Expected: both the `height: 100%` rule and the `ProseMirror-focused` cursor rule are still present, alongside the new bridge.

- [ ] **Step 3: Verify there is no leftover dark-only `.milkdown` block**

Run: `grep -n "data-theme=\"dark\"\] .milkdown" src/styles.css`
Expected: **no matches** (the dark-only bridge has been folded into the token bridge).

- [ ] **Step 4: Build + brace check**

Run: `npm run build 2>&1 | tail -6`
Expected: builds clean.
Run: `node -e "const fs=require('fs');const c=fs.readFileSync('src/styles.css','utf8');const o=(c.match(/{/g)||[]).length,cl=(c.match(/}/g)||[]).length;if(o!==cl){console.error('brace mismatch',o,cl);process.exit(1)}console.log('css ok, braces',o)"`
Expected: `css ok, braces <N>`.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css
git commit -m "feat: unify Crepe editor theming via app palette tokens (light + dark)"
```

---

## Task 7: Verification

**Files:** none (verification only)

- [ ] **Step 1: Headless checks**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6`
Expected: 24 tests pass (Rust untouched).
Run: `npm run build 2>&1 | tail -6`
Expected: builds clean.
Run: `grep -rn "copy-btn\|addCopyButtons" src/`
Expected: no matches.

- [ ] **Step 2: GUI smoke test** (`PATH="$HOME/.cargo/bin:$PATH" npm run tauri dev`)

- [ ] **Find:** ⌘F → type a word present in the sample (e.g. `Markdown`) → matches highlight, count shows `n/m`; Enter / Shift-Enter (and the prev/next buttons) move the current match and scroll it into view; Esc clears highlights and closes the bar. Open a different `.md` with the bar open → highlights refresh for the new document.
- [ ] **Outline:** ⌘⇧O → sidebar lists the document's headings; click a heading → scrolls to it; scroll the document → the active heading updates (scroll-spy); type a **new heading** into the document → within ~300ms the outline shows it.
- [ ] **Copy-code:** hover/focus a fenced code block → Crepe's built-in Copy button copies the code to the clipboard (paste to confirm).
- [ ] **Export:** File → Export as HTML… → save → open the file in a browser → it shows a clean, syntax-highlighted document with **no** editor chrome (no toolbar, cursor, or copy button) and renders in the light document palette.
- [ ] **Print:** File → Print… → the print preview shows a clean document (no toolbars/cursor/sidebars/find bar); cancel → inspect the DOM and confirm **no** leftover `#print-container` remains.
- [ ] **Theme:** View → Appearance → Light: editor surface is warm cream (not white), accents on-palette. Dark: editor surface is slate (not white), text legible, accents on-palette. Toggling re-themes the editor live.

- [ ] **Step 3: Commit any tweaks found during GUI testing**

```bash
git add -A
git commit -m "test: verify WYSIWYG slice D (find/outline/copy/export/print + theme)" --allow-empty
```

(After verification passes, this completes the WYSIWYG epic — use `superpowers:finishing-a-development-branch` to merge `feat/wysiwyg-editor` into `main`.)
