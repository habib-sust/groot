# Find & Replace (prosemirror-search) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace groot's read-only CSS-highlight find overlay with editor-grade Find **and Replace** backed by `prosemirror-search`, integrated into Crepe via a Milkdown `$prose` plugin.

**Architecture:** Add `prosemirror-search` to the Milkdown editor that Crepe wraps (`crepe.editor.use($prose(() => search()))`), capture the ProseMirror `EditorView` from Milkdown's ctx, and drive find/replace through the plugin's commands. Matches are document decorations (track live edits); replacements are transactions (undo-able). The old TreeWalker + `CSS.highlights` overlay is removed.

**Tech Stack:** Vite, Tauri v2, `@milkdown/crepe`, `prosemirror-search`, `@milkdown/kit` (re-exports `@milkdown/core` + `@milkdown/utils`), vanilla JS/CSS. No Rust changes.

---

## ⚠️ Notes for the implementer
- Use `~/.cargo/bin/cargo` (not on default PATH). Branch is `feat/slash-menu-find-replace`.
- **No JS unit-test harness**; `npm run build` (Vite) is the authoritative syntax/bundle check, GUI smoke is the behavioral check. Rust untouched → `cargo test` stays at 24.
- **Verified APIs** (don't re-derive):
  - `prosemirror-search` exports: `search()` (returns a ProseMirror `Plugin`), `SearchQuery({ search, replace?, caseSensitive?, regexp?, wholeWord? })`, `setSearchState(tr, query)` (returns a `Transaction`), commands `findNext`/`findPrev`/`replaceNext`/`replaceAll` (each `(state, dispatch) => boolean`), and `getMatchHighlights(state)` (returns a `DecorationSet`; `.find()` → array of `{from,to,...}`). Match decoration classes: `.ProseMirror-search-match` and `.ProseMirror-active-search-match`.
  - Milkdown: `$prose(fn)` from `@milkdown/kit/utils`; `editorViewCtx` from `@milkdown/kit/core`. The Crepe-wrapped `Editor` has `.use(plugin)` (call before `create()`), `.ctx` (after create), and `get editor()` is exposed by Crepe.

## File Structure
- `src/main.js` — imports; plugin wiring + `EditorView` capture in `render()`; find/replace operations replacing the overlay; listener wiring.
- `src/index.html` — `#find-bar` gains a replace row.
- `src/styles.css` — two-row `#find-bar` layout; theme `prosemirror-search` decoration classes; remove `::highlight()` rules.
- `package.json` (+ lock) — add `prosemirror-search`.

---

## Task 1: Add the dependency and verify a single ProseMirror copy

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

```bash
cd /Users/habib/Github/groot && npm install prosemirror-search
```

- [ ] **Step 2: Verify no duplicate ProseMirror cores**

The search plugin must operate on the *same* `prosemirror-state`/`-view`/`-model` instances Milkdown uses; duplicates would make decorations/commands silently no-op.
Run: `npm ls prosemirror-state prosemirror-view prosemirror-model 2>&1 | sort -u`
Expected: each package resolves to a **single** version (deduped). If a duplicate/second version appears under `prosemirror-search`, add an `overrides` block to `package.json` pinning these three to the versions Milkdown resolves (find them via `npm ls @milkdown/prose` → its prosemirror deps), then re-run `npm install` and re-check. Record what you did.

- [ ] **Step 3: Build sanity**

Run: `npm run build 2>&1 | tail -4` → clean (chunk-size warning is pre-existing).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add prosemirror-search for editor find/replace"
```

---

## Task 2: Wire the search plugin into Crepe and capture the view

**Files:** `src/main.js`

- [ ] **Step 1: Add imports**

At the top of `src/main.js`, after the existing `import { Crepe, CrepeFeature } from "@milkdown/crepe";` line, add:
```js
import { $prose } from "@milkdown/kit/utils";
import { editorViewCtx } from "@milkdown/kit/core";
import {
  search,
  setSearchState,
  findNext,
  findPrev,
  replaceNext,
  replaceAll,
  getMatchHighlights,
  SearchQuery,
} from "prosemirror-search";
```

- [ ] **Step 2: Add a module-level view handle**

Near the other top-level `let` declarations (e.g. just below `let crepe = null;`), add:
```js
let searchView = null;
```

- [ ] **Step 3: Register the plugin and capture the view in `render()`**

In `render()`, the current sequence is `crepe = new Crepe({...}); await crepe.create();`. Insert the `use(...)` call between construction and `create()`, and capture the view immediately after `create()`. The relevant lines become:
```js
    crepe = new Crepe({
      root: viewport,
      defaultValue: markdown,
      featureConfigs: {
        [CrepeFeature.CodeMirror]: { onCopy: () => showToast("Copied!") },
      },
    });
    crepe.editor.use($prose(() => search()));
    await crepe.create();
    searchView = crepe.editor.ctx.get(editorViewCtx);
```
(Keep whatever `features`/`featureConfigs` already exist from other work — only add the `crepe.editor.use(...)` line and the `searchView = ...` line. The overlay find still runs at this point; it is replaced in Task 3.)

- [ ] **Step 4: Build**

Run: `npm run build 2>&1 | tail -4` → clean. (The search plugin is registered but inert until Task 3 calls `setSearchState`.)

- [ ] **Step 5: Commit**

```bash
git add src/main.js
git commit -m "feat: register prosemirror-search plugin in the Crepe editor"
```

---

## Task 3: Drive Find through prosemirror-search; remove the overlay

**Files:** `src/main.js`, `src/styles.css`

- [ ] **Step 1: Replace the overlay find block in `src/main.js`**

Replace the entire region from `let findMatches = [];` through the end of `function goTo(delta) {...}` (the overlay state, `highlightsSupported`, `clearFindHighlights`, `closeFind`, `openFind`, `runSearch`, `setCurrent`, `goTo`) with the prosemirror-search-driven version below. Keep the `const findBar/findInput/findCount` declarations above it.

```js
// Build a SearchQuery from the current inputs (case-insensitive literal match).
function currentQuery() {
  return new SearchQuery({
    search: findInput.value,
    replace: replaceInput ? replaceInput.value : "",
    caseSensitive: false,
  });
}

// Push the current query into the editor's search plugin and refresh the count.
function applySearch() {
  if (!searchView) return;
  searchView.dispatch(setSearchState(searchView.state.tr, currentQuery()));
  updateFindCount();
}

function updateFindCount() {
  if (!searchView || !findInput.value) {
    findCount.textContent = "";
    findInput.classList.remove("no-match");
    return;
  }
  const matches = getMatchHighlights(searchView.state).find();
  const total = matches.length;
  if (total === 0) {
    findCount.textContent = "0/0";
    findInput.classList.add("no-match");
    return;
  }
  findInput.classList.remove("no-match");
  const sel = searchView.state.selection.from;
  let idx = matches.findIndex((m) => m.from <= sel && sel <= m.to);
  if (idx < 0) idx = 0;
  findCount.textContent = `${idx + 1}/${total}`;
}

function goTo(delta) {
  if (!searchView) return;
  if (delta > 0) findNext(searchView.state, searchView.dispatch);
  else findPrev(searchView.state, searchView.dispatch);
  searchView.focus();
  updateFindCount();
}

function openFind() {
  if (!findBar) return;
  findBar.hidden = false;
  findInput.focus();
  findInput.select();
  if (findInput.value) applySearch();
}

function closeFind() {
  if (!findBar) return;
  findBar.hidden = true;
  if (searchView) {
    searchView.dispatch(setSearchState(searchView.state.tr, new SearchQuery({ search: "" })));
    searchView.focus();
  }
  findInput.value = "";
  findInput.classList.remove("no-match");
  findCount.textContent = "";
}
```

- [ ] **Step 2: Repoint the find-bar listeners**

The existing `if (findBar) { ... }` listener block calls `runSearch`/`goTo`. Update the input handler to call `applySearch` (the prev/next/close handlers already call `goTo`/`closeFind`, which still exist). Replace the block with:
```js
if (findBar) {
  findInput.addEventListener("input", () => applySearch());
  findInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      goTo(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeFind();
    }
  });
  document.querySelector("#find-prev").addEventListener("click", () => goTo(-1));
  document.querySelector("#find-next").addEventListener("click", () => goTo(1));
  document.querySelector("#find-close").addEventListener("click", () => closeFind());
}
```
(The `replaceInput` reference in `currentQuery()` resolves to the element queried in Task 4; until then it is declared there. To keep this task building on its own, add the declaration now near the other find consts: `const replaceInput = document.querySelector("#replace-input");` — it will be `null` until Task 4 adds the markup, which `currentQuery()` already guards with `replaceInput ?`.)

- [ ] **Step 3: Update the reload re-apply in `render()`**

In `render()`, the Slice D lines:
```js
    // Find highlights are tied to the old DOM; clear and (if the bar is open) re-run.
    clearFindHighlights();
    if (findBar && !findBar.hidden) runSearch(findInput.value);
```
are now obsolete (the editor — and its search plugin — is recreated fresh each load). Replace them with a re-apply against the new view:
```js
    // Editor (and its search plugin) is recreated per load; re-apply the query
    // if the find bar is open so highlights reflect the new document.
    if (findBar && !findBar.hidden && findInput.value) applySearch();
```
Ensure this runs *after* `searchView = crepe.editor.ctx.get(editorViewCtx);` (from Task 2). Confirm no remaining references to `clearFindHighlights`, `runSearch`, `setCurrent`, `findMatches`, `findIndex`, or `highlightsSupported` exist: `grep -n "clearFindHighlights\|runSearch\|setCurrent\|findMatches\|findIndex\|highlightsSupported" src/main.js` → no matches.

- [ ] **Step 4: Swap the highlight CSS for decoration classes (`src/styles.css`)**

Replace these rules:
```css
::highlight(find-all) {
  background-color: rgba(216, 164, 62, 0.3);
}

::highlight(find-current) {
  background-color: rgba(216, 164, 62, 0.65);
}
```
with:
```css
.ProseMirror-search-match {
  background-color: rgba(216, 164, 62, 0.3);
}

.ProseMirror-active-search-match {
  background-color: rgba(216, 164, 62, 0.65);
}
```

- [ ] **Step 5: Build + grep check**

Run: `npm run build 2>&1 | tail -4` → clean.
Run: `grep -n "clearFindHighlights\|runSearch\|highlightsSupported\|::highlight" src/main.js src/styles.css` → no matches.

- [ ] **Step 6: Commit**

```bash
git add src/main.js src/styles.css
git commit -m "feat: drive find via prosemirror-search; remove CSS-highlight overlay"
```

---

## Task 4: Add the Replace row and replace operations

**Files:** `src/index.html`, `src/styles.css`, `src/main.js`

- [ ] **Step 1: Add the replace row markup (`src/index.html`)**

Replace the current find bar:
```html
    <div id="find-bar" hidden>
      <input id="find-input" type="text" placeholder="Find" autocomplete="off" spellcheck="false" />
      <span id="find-count"></span>
      <button id="find-prev" type="button" title="Previous (Shift+Enter)">↑</button>
      <button id="find-next" type="button" title="Next (Enter)">↓</button>
      <button id="find-close" type="button" title="Close (Esc)">✕</button>
    </div>
```
with a two-row version:
```html
    <div id="find-bar" hidden>
      <div class="find-row">
        <input id="find-input" type="text" placeholder="Find" autocomplete="off" spellcheck="false" />
        <span id="find-count"></span>
        <button id="find-prev" type="button" title="Previous (Shift+Enter)">↑</button>
        <button id="find-next" type="button" title="Next (Enter)">↓</button>
        <button id="find-close" type="button" title="Close (Esc)">✕</button>
      </div>
      <div class="find-row">
        <input id="replace-input" type="text" placeholder="Replace" autocomplete="off" spellcheck="false" />
        <button id="replace-one" type="button" title="Replace current match">Replace</button>
        <button id="replace-all" type="button" title="Replace all matches">All</button>
      </div>
    </div>
```

- [ ] **Step 2: Make `#find-bar` a two-row column (`src/styles.css`)**

Change the `#find-bar` rule from a single flex row to a column, and add a `.find-row` rule. Replace:
```css
#find-bar {
  position: fixed;
  top: 12px;
  right: 16px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}
```
with:
```css
#find-bar {
  position: fixed;
  top: 12px;
  right: 16px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}

.find-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
```
Then add a width rule so the replace input aligns with the find input (place after the existing `#find-input` rule):
```css
#replace-input {
  font: inherit;
  font-size: 0.9em;
  flex: 1;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--code-bg);
  color: var(--fg);
  outline: none;
}
```
(The existing `#find-bar button` rule already styles the Replace / All buttons.)

- [ ] **Step 3: Add replace operations + listeners (`src/main.js`)**

After the `if (findBar) { ... }` listener block, add replace handlers and wire the buttons:
```js
function replaceOne() {
  if (!searchView) return;
  searchView.dispatch(setSearchState(searchView.state.tr, currentQuery()));
  replaceNext(searchView.state, searchView.dispatch);
  searchView.focus();
  updateFindCount();
}

function replaceAllMatches() {
  if (!searchView) return;
  searchView.dispatch(setSearchState(searchView.state.tr, currentQuery()));
  replaceAll(searchView.state, searchView.dispatch);
  updateFindCount();
}

if (findBar) {
  replaceInput.addEventListener("input", () => applySearch());
  replaceInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      replaceOne();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeFind();
    }
  });
  document.querySelector("#replace-one").addEventListener("click", () => replaceOne());
  document.querySelector("#replace-all").addEventListener("click", () => replaceAllMatches());
}
```
(`replaceInput` was declared in Task 3 Step 2; it is now non-null. The two dispatches — `setSearchState` then the command — are sequential: the command reads `searchView.state`, which reflects the just-dispatched query.)

- [ ] **Step 4: Build**

Run: `npm run build 2>&1 | tail -4` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/index.html src/styles.css src/main.js
git commit -m "feat: add Replace / Replace All to the find bar"
```

---

## Task 5: Verification

**Files:** none (verification only)

- [ ] **Step 1: Headless**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | grep "test result"` → 24 passed.
Run: `npm run build 2>&1 | tail -4` → clean.
Run: `npm ls prosemirror-state prosemirror-view prosemirror-model 2>&1 | sort -u` → single version each (no duplicates).

- [ ] **Step 2: GUI smoke test** (`PATH="$HOME/.cargo/bin:$PATH" npm run tauri dev`)

- [ ] ⌘F opens the find bar (two rows); typing a term present in the doc highlights all matches and shows `n/m`; ↑/↓ (and Enter / Shift-Enter) move the active match, scroll it into view, and update the counter.
- [ ] With the find bar open, **edit the document** (type near a match) → highlights stay correct (no stale overlay); the counter updates.
- [ ] Type a replacement in the Replace field, click **Replace** → the current match is replaced and the selection advances to the next; counter updates.
- [ ] Click **Replace All** → every occurrence is replaced; **⌘Z once** reverts the whole Replace-All (single undo step).
- [ ] No matches → counter shows `0/0` and the find input flags no-match; Replace / Replace All do nothing.
- [ ] Esc clears highlights and closes the bar; reopening and searching works.
- [ ] Open a different document with the bar open → the query re-applies to the new doc.
- [ ] Match highlight + active-match colors are legible in both Light and Dark (View → Appearance).

- [ ] **Step 3: Commit any tweaks**

```bash
git add -A
git commit -m "test: verify find & replace" --allow-empty
```

(After this and the slash-menu plan are both verified, use `superpowers:finishing-a-development-branch` to merge `feat/slash-menu-find-replace` into `main`.)
