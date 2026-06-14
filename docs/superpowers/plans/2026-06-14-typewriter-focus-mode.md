# Typewriter + Focus Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two independent, session-only View-menu toggles — Focus Mode (dim all but the active block) and Typewriter Scrolling (pin the caret at ~40% viewport height) — to give Groot an immersive-writing layer.

**Architecture:** Pure frontend except two Rust menu items. Both features are body-class driven and hook the same `markdownUpdated` + `selectionUpdated` listeners the Phase 1 status bar uses, re-attached inside `render()`. Focus Mode tags the cursor's top-level block via `selection.$from.before(1)` → `view.nodeDOM`; Typewriter scrolls `#viewport` by `coordsAtPos(head).top − targetY`.

**Tech Stack:** Vanilla JS + Vite, Milkdown Crepe (ProseMirror), Tauri v2 (Rust menu).

**Testing note:** No JS unit-test harness (CLAUDE.md). Gates: `npm run build` and `~/.cargo/bin/cargo check --manifest-path src-tauri/Cargo.toml`. Behavioral checks are a manual dev run (final task).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/main.js` | `updateFocus()` + `applyTypewriter()`; reset `focusActiveEl` in `render()`; calls in both listener callbacks + initial paint; two `listen` handlers. |
| `src/styles.css` | `body.focus-mode` dim rules. |
| `src-tauri/src/menu.rs` | Two View menu items + two emit arms. |

---

## Task 1: Focus Mode + Typewriter logic (JS)

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add the two helper functions**

In `src/main.js`, after the `refreshStatus()` function (just before `function updateTitle()`), add:

```js
// ---- Focus mode + typewriter scrolling (Phase 2) ----
let focusActiveEl = null;

// Dim all but the cursor's top-level block (only when focus-mode is on).
function updateFocus() {
  if (!document.body.classList.contains("focus-mode") || !searchView) return;
  const view = searchView;
  let el = null;
  try {
    const pos = view.state.selection.$from.before(1); // start of depth-1 block
    el = view.nodeDOM(pos);
  } catch {
    el = null; // selection at a doc edge / depth 0
  }
  if (el && el.nodeType !== 1) el = el.parentElement; // ensure an Element
  if (focusActiveEl && focusActiveEl !== el) {
    focusActiveEl.classList.remove("focus-active");
  }
  if (el) el.classList.add("focus-active");
  focusActiveEl = el;
}

// Pin the caret at ~40% of viewport height (only when typewriter is on).
function applyTypewriter() {
  if (!document.body.classList.contains("typewriter") || !searchView) return;
  const view = searchView;
  let coords;
  try {
    coords = view.coordsAtPos(view.state.selection.head);
  } catch {
    return;
  }
  const vpRect = viewport.getBoundingClientRect();
  const targetY = vpRect.top + viewport.clientHeight * 0.4;
  const delta = coords.top - targetY;
  if (Math.abs(delta) > 1) viewport.scrollTop += delta;
}
```

- [ ] **Step 2: Reset stale focus reference + initial paint in `render()`**

In `render()`, at the very top of the `try` block (right after `currentSource = markdown;`... actually `currentSource` is set before the try — add it as the first statement inside `try {`), reset the stale node:

```js
    focusActiveEl = null;
```

Then, where the initial `refreshStatus();` was added in Phase 1 (right after `dirty = false;`), add the two initial calls beneath it:

```js
    dirty = false;
    refreshStatus();
    updateFocus();
    applyTypewriter();
```

- [ ] **Step 3: Hook both listener callbacks**

In `render()`'s `crepe.on((listener) => { ... })` block, add the two calls to BOTH callbacks. The `markdownUpdated` callback gains them at the end:

```js
      listener.markdownUpdated(() => {
        dirty = true;
        updateTitle();
        if (outline && !outline.hidden) {
          clearTimeout(outlineDebounce);
          outlineDebounce = setTimeout(buildOutline, 300);
        }
        clearTimeout(statusDebounce);
        statusDebounce = setTimeout(refreshStatus, 200);
        updateFocus();
        applyTypewriter();
      });
      listener.selectionUpdated(() => {
        refreshStatus();
        updateFocus();
        applyTypewriter();
      });
```

(The `selectionUpdated` callback was a one-liner `() => refreshStatus()` in Phase 1; expand it to the block form above.)

- [ ] **Step 4: Add the toggle listeners**

In `src/main.js`, after the `listen("toggle-status-bar", ...)` block, add:

```js
listen("toggle-focus-mode", () => {
  const on = document.body.classList.toggle("focus-mode");
  if (on) {
    updateFocus();
  } else if (focusActiveEl) {
    focusActiveEl.classList.remove("focus-active");
    focusActiveEl = null;
  }
});

listen("toggle-typewriter", () => {
  document.body.classList.toggle("typewriter");
  applyTypewriter();
});
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/main.js
git commit -m "feat(ui): focus mode + typewriter scrolling logic"
```

---

## Task 2: Focus Mode dim styles (CSS)

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add the dim rules**

In `src/styles.css`, append (near the other `#viewport .milkdown` editor rules, or at end of file):

```css
/* Focus mode: dim all but the active top-level block. */
body.focus-mode #viewport .ProseMirror > * {
  opacity: 0.35;
  transition: opacity 0.2s ease;
}
body.focus-mode #viewport .ProseMirror > *.focus-active {
  opacity: 1;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style(ui): focus-mode dim rules"
```

---

## Task 3: View menu items (Rust)

**Files:**
- Modify: `src-tauri/src/menu.rs`

- [ ] **Step 1: Build the two menu items**

In `src-tauri/src/menu.rs`, after the `toggle_status_bar` MenuItemBuilder, add:

```rust
    let toggle_focus_mode = MenuItemBuilder::new("Focus Mode")
        .id("toggle_focus_mode")
        .accelerator("CmdOrCtrl+Shift+F")
        .build(app)?;
    let toggle_typewriter = MenuItemBuilder::new("Typewriter Scrolling")
        .id("toggle_typewriter")
        .accelerator("CmdOrCtrl+Shift+T")
        .build(app)?;
```

- [ ] **Step 2: Add them to the View submenu**

Update the `view_menu` builder to include both (after `.item(&toggle_status_bar)`):

```rust
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&appearance_menu)
        .separator()
        .item(&toggle_outline)
        .item(&toggle_status_bar)
        .item(&toggle_focus_mode)
        .item(&toggle_typewriter)
        .build()?;
```

- [ ] **Step 3: Add the dispatch arms**

In `handle_menu_event`, after the `"toggle_status_bar" => { ... }` arm, add:

```rust
        "toggle_focus_mode" => {
            let _ = app.emit("toggle-focus-mode", ());
        }
        "toggle_typewriter" => {
            let _ = app.emit("toggle-typewriter", ());
        }
```

- [ ] **Step 4: Verify (build + cargo check)**

Run: `npm run build`
Expected: no errors.

Run: `~/.cargo/bin/cargo check --manifest-path src-tauri/Cargo.toml`
Expected: compiles; capabilities recompile cleanly.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/menu.rs
git commit -m "feat(ui): View > Focus Mode (Cmd+Shift+F) + Typewriter (Cmd+Shift+T)"
```

---

## Final Verification (manual dev run)

- [ ] **Build gates**

```bash
npm run build
~/.cargo/bin/cargo check --manifest-path src-tauri/Cargo.toml
```
Both succeed.

- [ ] **Run / reuse the dev app** (`PATH="$HOME/.cargo/bin:$PATH" npm run tauri dev`) and verify:
  1. View → Focus Mode (⌘⇧F): the block with the cursor stays full opacity, the rest dims; moving the cursor re-lights the new block; toggling off restores all.
  2. View → Typewriter Scrolling (⌘⇧T): caret stays ~40% down the viewport while typing and arrow-navigating in a long doc; toggling off leaves the scroll position alone.
  3. Both on together behave sanely.
  4. File → New (or open another file) with Focus Mode on → no console error; the new doc's block lights correctly (stale-node reset works).
  5. Reduced-motion (OS setting) → focus dim is effectively instant.

---

## Self-Review

- **Spec coverage:** Focus Mode logic + lifecycle → Task 1 (Steps 1–4) + Task 2 (CSS); Typewriter logic + lifecycle → Task 1; shared listener wiring + render reset → Task 1 (Steps 2–3); menu items + emits → Task 3. All spec components covered.
- **Placeholder scan:** no TBD/TODO; every code step shows full code.
- **Type/name consistency:** `updateFocus`, `applyTypewriter`, `focusActiveEl`, `focus-mode`/`typewriter` body classes, `focus-active` element class, `toggle-focus-mode`/`toggle-typewriter` events, `toggle_focus_mode`/`toggle_typewriter` ids — consistent across JS, CSS, and Rust.
