# In-Document Search (⌘F) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A minimal ⌘F find bar that highlights case-insensitive matches in the rendered document, shows a match count, and navigates between matches.

**Architecture:** A native Edit→Find item (⌘F) emits a `find` event. The webview shows a find-bar overlay; search uses the CSS Custom Highlight API (no DOM mutation) over `#viewport` text nodes.

**Tech Stack:** Rust (Tauri v2 menu/emit), vanilla JS/CSS (CSS Custom Highlight API).

## ⚠️ Note
Use `~/.cargo/bin/cargo` (cargo is NOT on the default Bash PATH).

## File Structure
- `src-tauri/src/menu.rs` — Find… item in the Edit submenu + `"find"` emit arm.
- `src/index.html` — find-bar markup.
- `src/styles.css` — find-bar styling + `::highlight(...)` rules.
- `src/main.js` — find module + `listen("find")` + clear-on-render.

---

## Task 1: Native Edit → Find… (⌘F) emitting `find`

**Files:**
- Modify: `src-tauri/src/menu.rs`

- [ ] **Step 1: Add the Find item to the Edit submenu**

In `src-tauri/src/menu.rs`, the Edit submenu is currently:
```rust
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;
```
Replace it with (adds a separator + a custom Find item using the already-imported `MenuItemBuilder`):
```rust
    let find_item = MenuItemBuilder::new("Find…")
        .id("find")
        .accelerator("CmdOrCtrl+F")
        .build(app)?;
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .separator()
        .item(&find_item)
        .build()?;
```

- [ ] **Step 2: Handle the `find` menu event**

In `handle_menu_event`, add this arm (e.g. right after the `"clear_recent"` arm, before `"no_recent"`):
```rust
        "find" => {
            let _ = app.emit("find", ());
        }
```
(`Emitter` is already imported in this file; `app.emit("find", ())` sends a unit payload — the frontend only needs the signal.)

- [ ] **Step 3: Build + test**

Run: `~/.cargo/bin/cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10` → clean.
Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6` → 21 pass (unchanged).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/menu.rs
git commit -m "feat: add Edit > Find (Cmd+F) menu item emitting find event"
```

---

## Task 2: Find bar — markup, styles, search logic

**Files:**
- Modify: `src/index.html`, `src/styles.css`, `src/main.js`

- [ ] **Step 1: Add the find-bar markup to `src/index.html`**

Inside `<body>`, between the `<main id="viewport" …></main>` line and the `<script …>` line, insert:
```html
    <div id="find-bar" hidden>
      <input id="find-input" type="text" placeholder="Find" autocomplete="off" spellcheck="false" />
      <span id="find-count"></span>
      <button id="find-prev" type="button" title="Previous (Shift+Enter)">↑</button>
      <button id="find-next" type="button" title="Next (Enter)">↓</button>
      <button id="find-close" type="button" title="Close (Esc)">✕</button>
    </div>
```

- [ ] **Step 2: Append find-bar + highlight styles to `src/styles.css`**

Append at the END of `src/styles.css`:
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

#find-bar[hidden] {
  display: none;
}

#find-input {
  font: inherit;
  font-size: 0.9em;
  width: 180px;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--code-bg);
  color: var(--fg);
  outline: none;
}

#find-input.no-match {
  border-color: #cf4d4d;
}

#find-count {
  min-width: 38px;
  text-align: center;
  font-size: 0.8em;
  color: var(--muted);
}

#find-bar button {
  font: inherit;
  font-size: 0.85em;
  padding: 2px 7px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--code-bg);
  color: var(--fg);
  cursor: pointer;
}

#find-bar button:hover {
  border-color: var(--link);
}

::highlight(find-all) {
  background-color: rgba(216, 164, 62, 0.3);
}

::highlight(find-current) {
  background-color: rgba(216, 164, 62, 0.65);
}
```

- [ ] **Step 3: Add the find module to `src/main.js`**

(a) In the existing `render` function, add `closeFind();` as the FIRST statement of the function body so a newly rendered document resets the find state. It becomes:
```js
async function render(markdown) {
  closeFind();
  try {
    viewport.innerHTML = await invoke("parse_markdown", { content: markdown });
    addCopyButtons();
  } catch (e) {
    showError(String(e));
  }
}
```

(b) Append this block at the END of `src/main.js` (function declarations hoist; the top-level element lookups + listeners run at module load, after the DOM is parsed):
```js
// ---- Find (Cmd+F) ----
const findBar = document.querySelector("#find-bar");
const findInput = document.querySelector("#find-input");
const findCount = document.querySelector("#find-count");

let findMatches = [];
let findIndex = 0;

const highlightsSupported = !!(window.CSS && CSS.highlights && window.Highlight);

function clearFindHighlights() {
  if (highlightsSupported) {
    CSS.highlights.delete("find-all");
    CSS.highlights.delete("find-current");
  }
  findMatches = [];
  findIndex = 0;
}

function closeFind() {
  if (!findBar) return;
  findBar.hidden = true;
  clearFindHighlights();
  findInput.value = "";
  findInput.classList.remove("no-match");
  findCount.textContent = "";
}

function openFind() {
  if (!findBar) return;
  findBar.hidden = false;
  findInput.focus();
  findInput.select();
  if (findInput.value) runSearch(findInput.value);
}

function runSearch(query) {
  clearFindHighlights();
  const q = query.toLowerCase();
  if (!q || !highlightsSupported) {
    findCount.textContent = "";
    findInput.classList.remove("no-match");
    return;
  }
  const walker = document.createTreeWalker(viewport, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue.toLowerCase();
    let from = 0;
    let idx;
    while ((idx = text.indexOf(q, from)) !== -1) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + q.length);
      findMatches.push(range);
      from = idx + q.length;
    }
  }
  if (findMatches.length === 0) {
    findCount.textContent = "0/0";
    findInput.classList.add("no-match");
    return;
  }
  findInput.classList.remove("no-match");
  CSS.highlights.set("find-all", new Highlight(...findMatches));
  setCurrent(0);
}

function setCurrent(i) {
  if (findMatches.length === 0) return;
  findIndex = (i + findMatches.length) % findMatches.length;
  const range = findMatches[findIndex];
  if (highlightsSupported) {
    CSS.highlights.set("find-current", new Highlight(range));
  }
  const el = range.startContainer.parentElement;
  if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  findCount.textContent = `${findIndex + 1}/${findMatches.length}`;
}

function goTo(delta) {
  if (findMatches.length > 0) setCurrent(findIndex + delta);
}

if (findBar) {
  findInput.addEventListener("input", () => runSearch(findInput.value));
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

listen("find", () => openFind());
```

- [ ] **Step 4: Verify**

Run: `node --check src/main.js` → no output.
Run: `node -e "const fs=require('fs');const c=fs.readFileSync('src/styles.css','utf8');const o=(c.match(/{/g)||[]).length,cl=(c.match(/}/g)||[]).length;if(o!==cl){console.error('brace mismatch',o,cl);process.exit(1)}if(!c.includes('::highlight(find-all)')){console.error('missing highlight rule');process.exit(1)}console.log('css ok, braces',o)"` → `css ok, braces <n>`.
Run: `grep -c "find-bar\|find-input\|find-prev\|find-next\|find-close" src/index.html` → ≥ 5 (markup present).

- [ ] **Step 5: Commit**

```bash
git add src/index.html src/styles.css src/main.js
git commit -m "feat: in-document find bar with CSS Custom Highlight API"
```

---

## Task 3: Verification

**Files:** none (verification only)

- [ ] **Step 1: Build + tests + lint (headless)**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6` → 21 pass.
Run: `~/.cargo/bin/cargo clippy --manifest-path src-tauri/Cargo.toml 2>&1 | tail -8` → no new warnings.
Run: `node --check src/main.js` → clean.

- [ ] **Step 2: GUI smoke test (run by the human, or driven via the verify skill)**

Run `npm run tauri dev`. With the sample (or an opened doc):
- [ ] Press **⌘F** (or Edit → Find…) → the find bar appears top-right, focused.
- [ ] Type a word present in the doc (e.g. `markdown`) → matches highlight, count shows `1/N`, the first match is emphasized and scrolled into view.
- [ ] **Enter** cycles forward, **Shift+Enter** backward, wrapping at the ends; the active match is emphasized each time. The ↑/↓ buttons do the same.
- [ ] Type a string that doesn't exist → `0/0` and the input border flags red.
- [ ] **Esc** (or ✕) closes the bar and clears highlights.
- [ ] Open a different file (or it re-renders) → the bar is closed and no stale highlights remain.
- [ ] Toggle View → Appearance → Dark/Light → the find highlight remains legible in both.

- [ ] **Step 3: Commit any tweaks**

```bash
git add -A
git commit -m "test: verify in-document search" --allow-empty
```
