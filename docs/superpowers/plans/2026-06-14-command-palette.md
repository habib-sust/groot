# Command Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ⌘K command palette — a centered modal listing the app's frontend actions, filterable by typing and runnable by keyboard/click, with each command's shortcut shown inline.

**Architecture:** Frontend-only except one Rust menu item. A static `COMMANDS` registry maps labels + inline shortcut hints to existing frontend functions. The palette DOM lives outside `#viewport`, so it needs no per-`render()` re-attach (wired once at startup). Triggered by a native View-menu item (⌘K) emitting `command-palette`.

**Tech Stack:** Vanilla JS + Vite, Tauri v2 (Rust menu).

**Testing note:** No JS unit-test harness (CLAUDE.md). Gates: `npm run build` and `~/.cargo/bin/cargo check --manifest-path src-tauri/Cargo.toml`. Behavioral checks are a manual dev run (final task).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/index.html` | `#command-palette` modal markup. |
| `src/styles.css` | Palette overlay/card/row styles. |
| `src/main.js` | `COMMANDS` registry; open/close/render/run logic; extract `toggleStatusBar()`; `listen("command-palette")`. |
| `src-tauri/src/menu.rs` | "Command Palette…" View item (⌘K) + emit arm. |

---

## Task 1: Palette markup + styles

**Files:**
- Modify: `src/index.html`
- Modify: `src/styles.css`

- [ ] **Step 1: Add the modal markup**

In `src/index.html`, after the `#unsaved-modal` block (before `<script>`), add:

```html
    <div id="command-palette" hidden>
      <div class="palette-card">
        <input id="palette-input" type="text" placeholder="Type a command…" autocomplete="off" spellcheck="false" />
        <ul id="palette-list"></ul>
      </div>
    </div>
```

- [ ] **Step 2: Add the styles**

In `src/styles.css`, append:

```css
/* Command palette (Cmd+K). */
#command-palette {
  position: fixed;
  inset: 0;
  z-index: 150;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  background: rgba(30, 22, 12, 0.34);
  backdrop-filter: blur(3px);
  animation: modal-fade 0.16s ease;
}

#command-palette[hidden] {
  display: none;
}

#command-palette .palette-card {
  width: min(560px, 90vw);
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  animation: modal-pop 0.18s cubic-bezier(0.2, 0.8, 0.3, 1.1);
}

#palette-input {
  font: inherit;
  font-size: 1.02em;
  padding: 14px 16px;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  color: var(--fg);
  outline: none;
}

#palette-list {
  list-style: none;
  margin: 0;
  padding: 6px;
  overflow-y: auto;
}

#palette-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  color: var(--fg);
  cursor: pointer;
}

#palette-list li.active {
  background: var(--accent-soft);
  color: var(--accent);
}

#palette-list li .palette-hint {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.85em;
  color: var(--muted);
}

#palette-list li.active .palette-hint {
  color: var(--accent);
}

#palette-list li.palette-empty {
  color: var(--muted);
  cursor: default;
  justify-content: flex-start;
}
```

- [ ] **Step 3: Hide the palette in print output**

In the `@media print` chrome-hiding selector list, add `#command-palette`:

```css
  #viewport,
  #outline,
  #find-bar,
  #unsaved-modal,
  #toast,
  #status-bar,
  #error-banner,
  #command-palette {
    display: none !important;
  }
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/index.html src/styles.css
git commit -m "feat(ui): command palette shell + styles"
```

---

## Task 2: Extract toggleStatusBar()

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add the function + reuse it in the listener**

In `src/main.js`, replace the existing `toggle-status-bar` listener:

```js
listen("toggle-status-bar", () => {
  document.body.classList.toggle("no-statusbar");
  refreshStatus();
});
```

with a named function + listener:

```js
function toggleStatusBar() {
  document.body.classList.toggle("no-statusbar");
  refreshStatus();
}

listen("toggle-status-bar", () => toggleStatusBar());
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "refactor(ui): extract toggleStatusBar()"
```

---

## Task 3: Command registry + palette logic

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add element refs**

In `src/main.js`, near the other `document.querySelector` refs at the top, add:

```js
const commandPalette = document.querySelector("#command-palette");
const paletteInput = document.querySelector("#palette-input");
const paletteList = document.querySelector("#palette-list");
```

- [ ] **Step 2: Add the registry + palette functions**

Add this block near the end of `src/main.js` (after the find/outline sections, before or after the Save/New section — anywhere at top level). It references `newFile`, `save`, `saveAs`, `openFind`, `toggleOutline`, `toggleStatusBar`, `exportHtml`, `printDocument`, all defined elsewhere in the file:

```js
// ---- Command palette (Cmd+K) ----
const COMMANDS = [
  { label: "New File",          hint: "⌘N",  run: () => newFile() },
  { label: "Save",              hint: "⌘S",  run: () => save() },
  { label: "Save As…",          hint: "⇧⌘S", run: () => saveAs() },
  { label: "Find…",             hint: "⌘F",  run: () => openFind() },
  { label: "Toggle Outline",    hint: "⇧⌘O", run: () => toggleOutline() },
  { label: "Toggle Status Bar", hint: "⌘/",  run: () => toggleStatusBar() },
  { label: "Export as HTML…",   hint: "",    run: () => exportHtml() },
  { label: "Print…",            hint: "⌘P",  run: () => printDocument() },
];

let paletteFiltered = [];
let paletteActive = 0;

function renderPalette(filter) {
  const q = filter.trim().toLowerCase();
  paletteFiltered = q
    ? COMMANDS.filter((c) => c.label.toLowerCase().includes(q))
    : COMMANDS.slice();
  if (paletteActive >= paletteFiltered.length) paletteActive = 0;
  paletteList.innerHTML = "";
  if (paletteFiltered.length === 0) {
    const li = document.createElement("li");
    li.className = "palette-empty";
    li.textContent = "No matching commands";
    paletteList.appendChild(li);
    return;
  }
  paletteFiltered.forEach((cmd, i) => {
    const li = document.createElement("li");
    li.className = i === paletteActive ? "active" : "";
    const label = document.createElement("span");
    label.textContent = cmd.label;
    const hint = document.createElement("span");
    hint.className = "palette-hint";
    hint.textContent = cmd.hint;
    li.append(label, hint);
    li.addEventListener("mousemove", () => setPaletteActive(i));
    li.addEventListener("click", () => {
      paletteActive = i;
      runActive();
    });
    paletteList.appendChild(li);
  });
}

function setPaletteActive(i) {
  paletteActive = i;
  [...paletteList.children].forEach((li, idx) =>
    li.classList.toggle("active", idx === i)
  );
}

function openPalette() {
  if (!commandPalette) return;
  commandPalette.hidden = false;
  paletteInput.value = "";
  paletteActive = 0;
  renderPalette("");
  paletteInput.focus();
}

function closePalette() {
  if (!commandPalette) return;
  commandPalette.hidden = true;
  if (searchView) searchView.focus();
}

function runActive() {
  const cmd = paletteFiltered[paletteActive];
  if (!cmd) return;
  closePalette();
  cmd.run();
}

if (commandPalette) {
  paletteInput.addEventListener("input", () => renderPalette(paletteInput.value));
  paletteInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (paletteFiltered.length) {
        setPaletteActive((paletteActive + 1) % paletteFiltered.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (paletteFiltered.length) {
        setPaletteActive(
          (paletteActive - 1 + paletteFiltered.length) % paletteFiltered.length
        );
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      runActive();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
    }
  });
  // Click on the backdrop (outside the card) closes the palette.
  commandPalette.addEventListener("mousedown", (e) => {
    if (e.target === commandPalette) closePalette();
  });
}

listen("command-palette", () => openPalette());
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat(ui): command palette registry + open/filter/run logic"
```

---

## Task 4: View menu item (Rust)

**Files:**
- Modify: `src-tauri/src/menu.rs`

- [ ] **Step 1: Build the menu item**

In `src-tauri/src/menu.rs`, before the `view_menu` builder, add:

```rust
    let command_palette = MenuItemBuilder::new("Command Palette…")
        .id("command_palette")
        .accelerator("CmdOrCtrl+K")
        .build(app)?;
```

- [ ] **Step 2: Add it to the View submenu**

Update `view_menu` to include it at the top, with a separator:

```rust
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&command_palette)
        .separator()
        .item(&appearance_menu)
        .separator()
        .item(&toggle_outline)
        .item(&toggle_status_bar)
        .build()?;
```

- [ ] **Step 3: Add the dispatch arm**

In `handle_menu_event`, after the `"toggle_status_bar" => { ... }` arm, add:

```rust
        "command_palette" => {
            let _ = app.emit("command-palette", ());
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
git commit -m "feat(ui): View > Command Palette… (Cmd+K)"
```

---

## Final Verification (manual dev run)

- [ ] **Build gates**

```bash
npm run build
~/.cargo/bin/cargo check --manifest-path src-tauri/Cargo.toml
```
Both succeed.

- [ ] **Run / reuse the dev app** and verify:
  1. ⌘K opens the palette, input focused, all 8 commands listed with shortcuts.
  2. Type "sa" → filters to Save, Save As; ArrowUp/Down move + wrap the highlight; Enter runs the highlighted command.
  3. Click a row runs it.
  4. Esc closes; clicking the backdrop closes; focus returns to the editor.
  5. Run-throughs: New, Save (toast), Save As (dialog), Find (find bar appears after palette closes), Toggle Outline, Toggle Status Bar, Export, Print all work.
  6. No-match query shows "No matching commands"; Enter does nothing.
  7. Light/dark themes both render the palette correctly.

---

## Self-Review

- **Spec coverage:** palette UI → Task 1; `toggleStatusBar` extraction → Task 2; registry + open/close/render/run + interactions → Task 3; menu trigger → Task 4. All spec components covered.
- **Placeholder scan:** no TBD/TODO; every code step shows full code.
- **Type/name consistency:** `commandPalette`/`paletteInput`/`paletteList` refs, `COMMANDS`, `paletteFiltered`/`paletteActive`, `renderPalette`/`setPaletteActive`/`openPalette`/`closePalette`/`runActive`, `toggleStatusBar`, `command-palette` event, `command_palette` id — consistent across JS, CSS, HTML, and Rust. Referenced frontend functions (`newFile`, `save`, `saveAs`, `openFind`, `toggleOutline`, `exportHtml`, `printDocument`) all exist in `main.js`.
