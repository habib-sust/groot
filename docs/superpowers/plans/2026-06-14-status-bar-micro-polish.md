# Status Bar + Micro-Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a slim bottom status bar (word count, reading time, save state, selection-aware counts, section breadcrumb) plus a micro-polish pass (empty-state placeholder, save toast, non-destructive errors, chrome transitions) to make Groot feel like a finished, "real" editor.

**Architecture:** Frontend-only except one Rust menu item. The status bar is a `position: fixed` footer spanning the window bottom; `#viewport` and `#outline` heights become `calc(100vh - var(--statusbar-h))` so they sit above it (chosen over restructuring the body flex layout — lower regression risk, the spec's layout goal achieved with less surgery). Status bar data comes from the live ProseMirror view (`searchView.state`) and the existing `dirty` flag, refreshed via the listener plugin's `markdownUpdated` + `selectionUpdated` events, re-attached inside `render()` (the standard Groot constraint).

**Tech Stack:** Vanilla JS + Vite, Milkdown Crepe (ProseMirror), Tauri v2 (Rust menu).

**Testing note:** Per CLAUDE.md there is **no JS unit-test harness**. The authoritative checks are `npm run build` (bundle/syntax) and, after the Rust change, `~/.cargo/bin/cargo check --manifest-path src-tauri/Cargo.toml`. Behavioral verification is a scripted manual dev run (final task).

---

## File Structure

| File | Responsibility for this feature |
|------|-------------------------------|
| `src/index.html` | Add `#status-bar` footer markup + `#error-banner` element. |
| `src/styles.css` | Status-bar layout/theme, `--statusbar-h` var + viewport/outline height, error banner, transition polish, `prefers-reduced-motion`, print-hide. |
| `src/main.js` | Status-bar compute + listener wiring (re-attached in `render()`); toggle handler; enable Placeholder feature; "Saved" toast; non-destructive `showError`. |
| `src-tauri/src/menu.rs` | `toggle_status_bar` View menu item + `toggle-status-bar` emit. |

---

## Task 1: Status bar markup + layout

**Files:**
- Modify: `src/index.html` (after `<main id="viewport">`)
- Modify: `src/styles.css`

- [ ] **Step 1: Add the footer markup**

In `src/index.html`, immediately after the `<main id="viewport"></main>` line, add:

```html
    <footer id="status-bar">
      <span id="sb-breadcrumb" class="sb-section"></span>
      <span class="sb-stats">
        <span id="sb-count"></span>
        <span id="sb-reading"></span>
        <span id="sb-save"></span>
      </span>
    </footer>
```

- [ ] **Step 2: Add status-bar CSS**

In `src/styles.css`, add a `--statusbar-h` token to BOTH `:root` blocks. In `:root { ... }` (after `--radius-sm: 7px;`) add:

```css
  --statusbar-h: 26px;
```

Add the identical line at the end of the `:root[data-theme="dark"] { ... }` block too (keeps the value themable later).

Then change the `#viewport` height (line ~104) from `height: 100vh;` to:

```css
  height: calc(100vh - var(--statusbar-h));
```

And the `#outline` height (line ~321) from `height: 100vh;` to:

```css
  height: calc(100vh - var(--statusbar-h));
```

Append a new status-bar block near the `#toast` rules:

```css
/* Slim bottom status bar (word count, reading time, save state, section). */
#status-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: var(--statusbar-h);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 14px;
  background: color-mix(in srgb, var(--surface-2), var(--bg) 30%);
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.78em;
  line-height: 1;
  user-select: none;
  -webkit-user-select: none;
}

#status-bar .sb-section {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

#status-bar .sb-stats {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: none;
}

#status-bar #sb-save {
  color: var(--accent);
  font-weight: 600;
}

#status-bar.dirty #sb-save {
  color: var(--muted);
}

/* Hidden state: collapse the bar AND reclaim its height for viewport/outline. */
body.no-statusbar {
  --statusbar-h: 0px;
}
body.no-statusbar #status-bar {
  display: none;
}
```

- [ ] **Step 3: Hide the bar in print output**

In the `@media print` block, add `#status-bar` to the chrome-hiding selector list (alongside `#viewport, #outline, #find-bar, #unsaved-modal, #toast`):

```css
  #viewport,
  #outline,
  #find-bar,
  #unsaved-modal,
  #toast,
  #status-bar {
    display: none !important;
  }
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: builds with no errors; `dist/` regenerated.

- [ ] **Step 5: Commit**

```bash
git add src/index.html src/styles.css
git commit -m "feat(ui): add status bar shell + layout"
```

---

## Task 2: Status bar logic (counts, reading time, save state, selection, breadcrumb)

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add status-bar element refs + compute helpers**

In `src/main.js`, after the `const viewport = document.querySelector("#viewport");` line (~line 20), add:

```js
const statusBar = document.querySelector("#status-bar");
const sbBreadcrumb = document.querySelector("#sb-breadcrumb");
const sbCount = document.querySelector("#sb-count");
const sbReading = document.querySelector("#sb-reading");
const sbSave = document.querySelector("#sb-save");
```

After the `basename` helper (~line 70), add the status computation:

```js
function countWords(text) {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

// Nearest heading whose start is before the cursor — the enclosing section.
function currentSection(state) {
  const pos = state.selection.from;
  let heading = "";
  state.doc.descendants((node, nodePos) => {
    if (nodePos < pos && node.type.name === "heading") heading = node.textContent;
  });
  return heading;
}

let statusDebounce = null;
function refreshStatus() {
  if (!statusBar) return;
  // Save state is always meaningful, even before the editor view exists.
  statusBar.classList.toggle("dirty", dirty);
  sbSave.textContent = dirty ? "● Unsaved" : "✓ Saved";

  if (!searchView) {
    sbBreadcrumb.textContent = "";
    sbCount.textContent = "";
    sbReading.textContent = "";
    return;
  }
  const state = searchView.state;
  const { from, to } = state.selection;

  sbBreadcrumb.textContent = currentSection(state)
    ? `§ ${currentSection(state)}`
    : "";

  if (from !== to) {
    const words = countWords(state.doc.textBetween(from, to, " "));
    sbCount.textContent = `${words} ${words === 1 ? "word" : "words"} selected`;
    sbReading.textContent = "";
  } else {
    const words = countWords(state.doc.textContent);
    sbCount.textContent = `${words} ${words === 1 ? "word" : "words"}`;
    sbReading.textContent = words ? `${Math.max(1, Math.ceil(words / 200))} min read` : "";
  }
}
```

- [ ] **Step 2: Wire refresh into the editor lifecycle**

In `render()`, the `crepe.on((listener) => listener.markdownUpdated(...))` block (~line 133) currently only handles `markdownUpdated`. Replace that single `crepe.on(...)` call with one that registers both listeners:

```js
    crepe.on((listener) => {
      listener.markdownUpdated(() => {
        dirty = true;
        updateTitle();
        // Keep the outline current while editing (only if it's visible).
        if (outline && !outline.hidden) {
          clearTimeout(outlineDebounce);
          outlineDebounce = setTimeout(buildOutline, 300);
        }
        // Counts recompute is O(doc); debounce against per-keystroke churn.
        clearTimeout(statusDebounce);
        statusDebounce = setTimeout(refreshStatus, 200);
      });
      listener.selectionUpdated(() => refreshStatus());
    });
```

Then, just after `dirty = false;` (the line right below the `crepe.on(...)` block, ~line 144), add an initial paint:

```js
    refreshStatus();
```

- [ ] **Step 3: Keep save-state in sync via `updateTitle`**

`updateTitle()` is the single choke point for every `dirty` change (edit, save, new file). Add a status refresh at the end of `updateTitle()` (~line 75) so the save indicator never drifts:

```js
function updateTitle() {
  const name = currentPath ? basename(currentPath) : "Untitled";
  invoke("set_window_title", { title: (dirty ? "• " : "") + name });
  refreshStatus();
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: builds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main.js
git commit -m "feat(ui): live status bar (words, reading time, save state, section)"
```

---

## Task 3: View → Toggle Status Bar

**Files:**
- Modify: `src-tauri/src/menu.rs`
- Modify: `src/main.js`

- [ ] **Step 1: Add the menu item (build)**

In `src-tauri/src/menu.rs`, after the `toggle_outline` MenuItemBuilder (~line 128), add:

```rust
    let toggle_status_bar = MenuItemBuilder::new("Toggle Status Bar")
        .id("toggle_status_bar")
        .accelerator("CmdOrCtrl+/")
        .build(app)?;
```

Then add it to the `view_menu` builder (after `.item(&toggle_outline)`):

```rust
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&appearance_menu)
        .separator()
        .item(&toggle_outline)
        .item(&toggle_status_bar)
        .build()?;
```

- [ ] **Step 2: Add the dispatch arm**

In `handle_menu_event`, after the `"toggle_outline" => { ... }` arm (~line 180), add:

```rust
        "toggle_status_bar" => {
            let _ = app.emit("toggle-status-bar", ());
        }
```

- [ ] **Step 3: Handle the event in the frontend**

In `src/main.js`, after `listen("toggle-outline", ...)` (~line 449), add:

```js
listen("toggle-status-bar", () => {
  document.body.classList.toggle("no-statusbar");
  refreshStatus();
});
```

- [ ] **Step 4: Verify (build + cargo check)**

Run: `npm run build`
Expected: no errors.

Run: `~/.cargo/bin/cargo check --manifest-path src-tauri/Cargo.toml`
Expected: compiles; capabilities recompile cleanly.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/menu.rs src/main.js
git commit -m "feat(ui): View > Toggle Status Bar (Cmd+/)"
```

---

## Task 4: New-file empty-state placeholder

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Import the Placeholder feature flag**

`CrepeFeature` is already imported (`import { Crepe, CrepeFeature } from "@milkdown/crepe";`). No new import needed.

- [ ] **Step 2: Enable + configure the placeholder**

In `render()`, the `new Crepe({...})` call sets `features: { [CrepeFeature.Latex]: false }`. Add the Placeholder config under `featureConfigs` (the Placeholder feature is on by default; we only configure its text). Inside the existing `featureConfigs: { ... }` object, add:

```js
        [CrepeFeature.Placeholder]: {
          text: "Start writing…",
          mode: "doc",
        },
```

So `featureConfigs` reads (CodeMirror + BlockEdit already present, Placeholder added):

```js
      featureConfigs: {
        [CrepeFeature.CodeMirror]: { onCopy: () => showToast("Copied!") },
        [CrepeFeature.BlockEdit]: {
          advancedGroup: { image: null, math: null },
        },
        [CrepeFeature.Placeholder]: {
          text: "Start writing…",
          mode: "doc",
        },
      },
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat(ui): empty-document placeholder"
```

---

## Task 5: Save acknowledgement toast

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Toast on successful save**

In `save()`, after `dirty = false; updateTitle();` inside the `try` block (~line 535), add:

```js
    showToast("Saved");
```

- [ ] **Step 2: Toast on successful save-as**

In `saveAs()`, inside `if (path) { ... }` after `updateTitle();` (~line 553), add:

```js
      showToast("Saved");
```

(Only fires when `path` is truthy — i.e. the user did not cancel the dialog.)

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat(ui): confirm saves with a toast"
```

---

## Task 6: Non-destructive error display

**Files:**
- Modify: `src/index.html`
- Modify: `src/styles.css`
- Modify: `src/main.js`

**Why:** Today `showError` does `viewport.innerHTML = ...`, destroying the live editor and any unsaved content on ANY error. Replace it with a dismissible banner overlay that never touches the editor.

- [ ] **Step 1: Add the banner markup**

In `src/index.html`, after the `<footer id="status-bar">…</footer>` block, add:

```html
    <div id="error-banner" hidden>
      <span id="error-banner-msg"></span>
      <button id="error-banner-close" type="button" title="Dismiss">✕</button>
    </div>
```

(Write the literal `✕` glyph in the file, not the escape — shown here escaped only for clarity.)

- [ ] **Step 2: Style the banner**

In `src/styles.css`, add near the `#toast` rules:

```css
/* Non-destructive error banner (never replaces the editor). */
#error-banner {
  position: fixed;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 300;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 70vw;
  padding: 8px 10px 8px 14px;
  background: var(--surface);
  color: var(--fg);
  border: 1px solid #cf4d4d;
  border-left-width: 3px;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  font-size: 0.9em;
}

#error-banner[hidden] {
  display: none;
}

#error-banner #error-banner-msg {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

#error-banner button {
  font: inherit;
  line-height: 1;
  padding: 2px 6px;
  border: 0;
  background: none;
  color: var(--muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

#error-banner button:hover {
  color: var(--fg);
  background: var(--accent-soft);
}
```

Also add `#error-banner` to the `@media print` hide list so it never prints.

- [ ] **Step 3: Rewrite `showError` to be non-destructive**

In `src/main.js`, replace the existing `showError` function (~lines 49-51):

```js
function showError(message) {
  viewport.innerHTML = `<p class="error">⚠️ ${message}</p>`;
}
```

with:

```js
const errorBanner = document.querySelector("#error-banner");
const errorBannerMsg = document.querySelector("#error-banner-msg");

// Non-destructive: shows a dismissible banner; never replaces the live editor.
// When no editor exists yet (initial load failure), fall back to inline content.
function showError(message) {
  if (!crepe && viewport) {
    viewport.innerHTML = `<p class="error">⚠️ ${message}</p>`;
    return;
  }
  if (!errorBanner) return;
  errorBannerMsg.textContent = `⚠️ ${message}`;
  errorBanner.hidden = false;
}
```

- [ ] **Step 4: Wire the dismiss button**

Near the other listener wiring (e.g. after the find-bar block), add:

```js
document.querySelector("#error-banner-close")?.addEventListener("click", () => {
  if (errorBanner) errorBanner.hidden = true;
});
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/index.html src/styles.css src/main.js
git commit -m "fix(ui): non-destructive error banner (stop wiping the editor)"
```

---

## Task 7: Chrome transition polish + reduced-motion

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add subtle entrance transitions**

In `src/styles.css`, append:

```css
/* Cohesive chrome entrance for find bar, status bar, and error banner. */
#find-bar,
#error-banner {
  transition: opacity 0.14s ease, transform 0.14s ease;
}

#error-banner:not([hidden]) {
  animation: chrome-drop 0.16s ease;
}

@keyframes chrome-drop {
  from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style(ui): cohesive chrome transitions + reduced-motion"
```

---

## Final Verification (manual dev run)

- [ ] **Build gates**

```bash
npm run build
~/.cargo/bin/cargo check --manifest-path src-tauri/Cargo.toml
```
Both succeed.

- [ ] **Run the app**

```bash
PATH="$HOME/.cargo/bin:$PATH" npm run tauri dev
```

- [ ] **Verify each behavior:**
  1. Status bar visible at the bottom; word count + "N min read" + "✓ Saved" show on the sample doc.
  2. Type → save state flips to "● Unsaved"; word count updates (after a brief debounce).
  3. Select a range of text → count switches to "N words selected"; reading time hides.
  4. Move the cursor into different sections → breadcrumb shows "§ <nearest heading>".
  5. ⌘S → "● Unsaved" returns to "✓ Saved" and a "Saved" toast appears.
  6. View → Toggle Status Bar (⌘/) hides/shows the bar; viewport reclaims the space (no gap).
  7. File → New → empty editor shows the "Start writing…" placeholder; it vanishes on first keystroke.
  8. Induce an error (e.g. trigger a save failure) → a dismissible banner appears at top **and the editor + content remain intact**; the ✕ closes it.
  9. Toggle OS dark/light → status bar + banner read correctly in both themes.
  10. Print preview → status bar and banner are absent from the printed page.

---

## Self-Review

- **Spec coverage:** status bar contents (words/reading/save/selection/breadcrumb) → Task 2; toggle → Task 3; empty state → Task 4; save feedback → Task 5; non-destructive errors → Task 6; transitions + reduced-motion → Task 7; print-hide + theming → Tasks 1/6. All spec sections covered. Layout goal met via fixed bar + `calc()` (documented deviation from "column restructure", same outcome, lower risk).
- **Placeholder scan:** no TBD/TODO; every code step shows full code.
- **Type/name consistency:** `refreshStatus`, `currentSection`, `countWords`, `statusDebounce`, `#status-bar`/`sb-*` ids, `no-statusbar` body class, `toggle-status-bar` event, `error-banner` ids — all referenced consistently across tasks and matched to the HTML/CSS.
