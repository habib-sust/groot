# Outline / TOC Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A toggleable left sidebar listing the document's headings (indented by level) with click-to-scroll and scroll-spy.

**Architecture:** A View→Toggle Outline item (⌘⇧O) emits `toggle-outline`. The webview shows a `#outline` nav (left flex column); after each render it lists headings (assigning ids), wires click-to-scroll, and an `IntersectionObserver` highlights the active section.

**Tech Stack:** Rust (Tauri v2 menu/emit), vanilla JS/CSS (IntersectionObserver).

## ⚠️ Note
Use `~/.cargo/bin/cargo` (cargo is NOT on the default Bash PATH).

## File Structure
- `src-tauri/src/menu.rs` — View → Toggle Outline item + `"toggle_outline"` emit arm.
- `src/index.html` — `<nav id="outline" hidden>` before `#viewport`.
- `src/styles.css` — body flex; `#outline` + entry/active/empty styling; `#viewport` as a flex scroll child.
- `src/main.js` — `buildOutline`/`toggleOutline`/`slugify` + observer; `render()` hook; `listen("toggle-outline")`.

---

## Task 1: View → Toggle Outline (⌘⇧O)

**Files:**
- Modify: `src-tauri/src/menu.rs`

- [ ] **Step 1: Add the Toggle Outline item to the View submenu**

In `src-tauri/src/menu.rs`, the View submenu is currently:
```rust
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&appearance_menu)
        .build()?;
```
Replace it with:
```rust
    let toggle_outline = MenuItemBuilder::new("Toggle Outline")
        .id("toggle_outline")
        .accelerator("CmdOrCtrl+Shift+O")
        .build(app)?;
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&appearance_menu)
        .separator()
        .item(&toggle_outline)
        .build()?;
```

- [ ] **Step 2: Handle the event**

In `handle_menu_event`, add this arm (e.g. right after the `"find" => { … }` arm):
```rust
        "toggle_outline" => {
            let _ = app.emit("toggle-outline", ());
        }
```

- [ ] **Step 3: Build + test**

Run: `~/.cargo/bin/cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10` → clean.
Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6` → 21 pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/menu.rs
git commit -m "feat: add View > Toggle Outline (Cmd+Shift+O) menu item"
```

---

## Task 2: Outline sidebar — markup, layout, build + scroll-spy

**Files:**
- Modify: `src/index.html`, `src/styles.css`, `src/main.js`

- [ ] **Step 1: Add the nav to `src/index.html`**

Inside `<body>`, immediately BEFORE the `<main id="viewport" …></main>` line, insert:
```html
    <nav id="outline" hidden></nav>
```

- [ ] **Step 2: Update `src/styles.css`**

(a) After the existing `html, body { … }` rule, add:
```css
body {
  display: flex;
}
```

(b) Replace the existing `#viewport { … }` rule with (adds flex sizing + own scroll; keeps centering):
```css
#viewport {
  flex: 1;
  height: 100vh;
  overflow: auto;
  max-width: 860px;
  margin: 0 auto;
  padding: 40px 32px 80px;
  font-size: 17px;
  line-height: 1.7;
}
```

(c) Append at the END of the file:
```css
#outline {
  flex: none;
  width: 240px;
  height: 100vh;
  overflow: auto;
  padding: 24px 8px;
  border-right: 1px solid var(--border);
  background: var(--bg);
}

#outline[hidden] {
  display: none;
}

.outline-link {
  display: block;
  padding: 3px 8px;
  border-left: 2px solid transparent;
  color: var(--muted);
  font-size: 0.85em;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.outline-link:hover {
  color: var(--fg);
}

.outline-link[data-level="1"] { padding-left: 8px; font-weight: 600; }
.outline-link[data-level="2"] { padding-left: 20px; }
.outline-link[data-level="3"] { padding-left: 32px; }
.outline-link[data-level="4"] { padding-left: 44px; }
.outline-link[data-level="5"] { padding-left: 56px; }
.outline-link[data-level="6"] { padding-left: 68px; }

.outline-link.active {
  color: var(--link);
  border-left-color: var(--link);
}

.outline-empty {
  padding: 8px;
  color: var(--muted);
  font-size: 0.85em;
}
```

- [ ] **Step 3: Edit `src/main.js`**

(a) In the `render` function, add `buildOutline();` right after `addCopyButtons();` (inside the try):
```js
async function render(markdown) {
  closeFind();
  try {
    viewport.innerHTML = await invoke("parse_markdown", { content: markdown });
    addCopyButtons();
    buildOutline();
  } catch (e) {
    showError(String(e));
  }
}
```

(b) Append this block at the END of `src/main.js`:
```js
// ---- Outline / TOC ----
const outline = document.querySelector("#outline");
let outlineObserver = null;

function slugify(text) {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "section";
}

function toggleOutline() {
  if (outline) outline.hidden = !outline.hidden;
}

function buildOutline() {
  if (!outline) return;
  if (outlineObserver) {
    outlineObserver.disconnect();
    outlineObserver = null;
  }
  outline.innerHTML = "";

  const headings = [...viewport.querySelectorAll("h1, h2, h3, h4, h5, h6")];
  if (headings.length === 0) {
    outline.innerHTML = '<p class="outline-empty">No headings in this document.</p>';
    return;
  }

  const used = new Map();
  const linkByHeading = new Map();
  for (const h of headings) {
    if (!h.id) {
      const base = slugify(h.textContent);
      const n = used.get(base) || 0;
      used.set(base, n + 1);
      h.id = n ? `${base}-${n}` : base;
    }
    const level = Number(h.tagName.substring(1));
    const link = document.createElement("a");
    link.className = "outline-link";
    link.dataset.level = String(level);
    link.textContent = h.textContent;
    link.addEventListener("click", () => h.scrollIntoView({ block: "start" }));
    outline.appendChild(link);
    linkByHeading.set(h, link);
  }

  const visible = new Set();
  outlineObserver = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      }
      let active = null;
      for (const h of headings) {
        if (visible.has(h)) {
          active = h;
          break;
        }
      }
      if (!active) {
        for (const h of headings) {
          if (h.getBoundingClientRect().top < 120) active = h;
          else break;
        }
      }
      for (const [h, link] of linkByHeading) {
        link.classList.toggle("active", h === active);
      }
      const activeLink = active && linkByHeading.get(active);
      if (activeLink) activeLink.scrollIntoView({ block: "nearest" });
    },
    { root: viewport, rootMargin: "0px 0px -70% 0px", threshold: 0 }
  );
  headings.forEach((h) => outlineObserver.observe(h));
}

listen("toggle-outline", () => toggleOutline());
```

- [ ] **Step 4: Verify**

Run: `node --check src/main.js` → no output.
Run: `node -e "const fs=require('fs');const c=fs.readFileSync('src/styles.css','utf8');const o=(c.match(/{/g)||[]).length,cl=(c.match(/}/g)||[]).length;if(o!==cl){console.error('brace mismatch',o,cl);process.exit(1)}if(!c.includes('#outline')){console.error('missing #outline');process.exit(1)}console.log('css ok, braces',o)"` → `css ok, braces <n>`.
Run: `grep -c "id=\"outline\"" src/index.html` → 1.

- [ ] **Step 5: Commit**

```bash
git add src/index.html src/styles.css src/main.js
git commit -m "feat: outline sidebar with click-to-scroll and scroll-spy"
```

---

## Task 3: Verification

**Files:** none (verification only)

- [ ] **Step 1: Headless**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6` → 21 pass.
Run: `~/.cargo/bin/cargo clippy --manifest-path src-tauri/Cargo.toml 2>&1 | tail -8` → no new warnings.
Run: `node --check src/main.js` → clean.

- [ ] **Step 2: GUI smoke test (run by the human, or driven via the verify skill)**

Run `npm run tauri dev`. Open a doc with headings (e.g. one of the recent `.md` files), then:
- [ ] **⌘⇧O** (or View → Toggle Outline) → the left sidebar appears with the document's headings, indented by level; toggling again hides it.
- [ ] Click an entry → the document scrolls to that heading.
- [ ] Scroll the document → the entry for the current section highlights.
- [ ] Open the launch sample (few headings) and a no-heading doc → the latter shows "No headings in this document.".
- [ ] Toggle View → Appearance Light/Dark → the sidebar is themed correctly in both; find-bar (⌘F) and copy buttons still work with the sidebar open.

- [ ] **Step 3: Commit any tweaks**

```bash
git add -A
git commit -m "test: verify outline sidebar" --allow-empty
```
