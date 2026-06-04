# Live-Reload on External File Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto re-render the open file when it changes on disk, preserving scroll.

**Architecture:** `notify` + `notify-debouncer-mini` watch the open file's parent directory (filtered to the file, debounced). A background callback emits `file-changed`; the frontend re-reads + re-renders, restoring scroll. The current file is tracked in Rust state; `open_path` re-points the watcher.

**Tech Stack:** Rust (notify), Tauri v2 (state/emit), vanilla JS.

## ⚠️ Note (read before Task 1)
- Use `~/.cargo/bin/cargo` (cargo is NOT on the default Bash PATH).
- The `notify` / `notify-debouncer-mini` API is version-sensitive. The code below targets `notify-debouncer-mini` 0.4/0.5. If it doesn't compile, check `~/.cargo/bin/cargo doc -p notify-debouncer-mini` / docs.rs and adjust, preserving behavior. Likely spots: `new_debouncer(timeout, handler)` arity (some versions take `new_debouncer(timeout, tick_rate, handler)`), `DebounceEventResult`/`DebouncedEvent.path`, the re-exported `notify` path, and needing `notify::Watcher` in scope for `.watch()/.unwatch()`.

## File Structure
- `src-tauri/Cargo.toml` — add `notify`, `notify-debouncer-mini`.
- `src-tauri/src/watcher.rs` — **new:** `WatchState`, `path_matches` (+test), `build_watcher`, `watch_file`.
- `src-tauri/src/lib.rs` — `mod watcher`; manage current-file + `WatchState`; build watcher in `setup`.
- `src-tauri/src/menu.rs` — `open_path` re-points the watcher.
- `src/main.js` — `listen("file-changed")` → scroll-preserving reload.

---

## Task 1: Watcher module + state (with `path_matches` TDD)

**Files:**
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`
- Create: `src-tauri/src/watcher.rs`

- [ ] **Step 1: Add dependencies**

```bash
cd src-tauri && ~/.cargo/bin/cargo add notify notify-debouncer-mini && cd ..
```
Expected: both appear in `Cargo.toml` `[dependencies]`.

- [ ] **Step 2: Create `src-tauri/src/watcher.rs`**

```rust
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Holds the live debouncer (keeping the watch alive) and the directory it watches.
pub struct WatchState {
    debouncer: Debouncer<RecommendedWatcher>,
    watched_dir: Option<PathBuf>,
}

/// True if any changed path equals the current file.
pub fn path_matches(changed: &[PathBuf], current: &Path) -> bool {
    changed.iter().any(|p| p == current)
}

/// Build the file watcher. Its debounced callback (a background thread) emits
/// `file-changed` when the currently-open file (read from managed state) changes.
pub fn build_watcher<R: Runtime>(app: &AppHandle<R>) -> WatchState {
    let handle = app.clone();
    let debouncer = new_debouncer(
        Duration::from_millis(200),
        move |res: DebounceEventResult| {
            if let Ok(events) = res {
                let changed: Vec<PathBuf> = events.into_iter().map(|e| e.path).collect();
                let current = handle
                    .state::<Mutex<Option<PathBuf>>>()
                    .lock()
                    .unwrap()
                    .clone();
                if let Some(current) = current {
                    if path_matches(&changed, &current) {
                        let _ = handle.emit("file-changed", current.to_string_lossy().to_string());
                    }
                }
            }
        },
    )
    .expect("failed to create file watcher");
    WatchState {
        debouncer,
        watched_dir: None,
    }
}

/// Set the current file and re-point the watcher at its parent directory.
pub fn watch_file<R: Runtime>(app: &AppHandle<R>, path: &Path) {
    *app.state::<Mutex<Option<PathBuf>>>().lock().unwrap() = Some(path.to_path_buf());
    let dir = match path.parent() {
        Some(d) => d.to_path_buf(),
        None => return,
    };
    let state = app.state::<Mutex<WatchState>>();
    let mut ws = state.lock().unwrap();
    if ws.watched_dir.as_deref() == Some(dir.as_path()) {
        return;
    }
    if let Some(old) = ws.watched_dir.take() {
        let _ = ws.debouncer.watcher().unwatch(&old);
    }
    if ws
        .debouncer
        .watcher()
        .watch(&dir, RecursiveMode::NonRecursive)
        .is_ok()
    {
        ws.watched_dir = Some(dir);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_matches_detects_current() {
        let cur = PathBuf::from("/a/b.md");
        assert!(path_matches(&[PathBuf::from("/a/b.md")], &cur));
        assert!(path_matches(
            &[PathBuf::from("/x.md"), PathBuf::from("/a/b.md")],
            &cur
        ));
        assert!(!path_matches(&[PathBuf::from("/a/c.md")], &cur));
        assert!(!path_matches(&[], &cur));
    }
}
```

- [ ] **Step 3: Register the module + wire `setup` in `lib.rs`**

(a) Add `mod watcher;` near the other `mod` lines in `src-tauri/src/lib.rs`.

(b) In the `.setup(|app| { … })` closure, BEFORE the `Ok(())`, add (manage the
current-file state first, then build + manage the watcher):
```rust
            app.manage(Mutex::new(None::<std::path::PathBuf>));
            let watch_state = watcher::build_watcher(&app.handle().clone());
            app.manage(Mutex::new(watch_state));
```

- [ ] **Step 4: Build + test (fix notify API per the ⚠️ note)**

Run: `~/.cargo/bin/cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -40` → iterate to clean. The watcher is inert so far (nothing calls `watch_file` yet) — that's expected; a dead-code warning for `watch_file` is fine.
Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6` → 22 pass (21 + `path_matches_detects_current`).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/watcher.rs src-tauri/src/lib.rs
git commit -m "feat: add file watcher (notify) emitting file-changed"
```

---

## Task 2: Re-point on open + frontend reload

**Files:**
- Modify: `src-tauri/src/menu.rs`, `src/main.js`

- [ ] **Step 1: Re-point the watcher in `open_path` (`menu.rs`)**

In `src-tauri/src/menu.rs`, in `pub fn open_path`, add this as the FIRST statement
of the function body (it sets the current-file state and re-points the watcher):
```rust
    crate::watcher::watch_file(app, &path);
```
(`open_path(app, path)` — `app: &AppHandle<R>`, `path: PathBuf`; `watch_file` takes `&Path`, and `&path` coerces.)

- [ ] **Step 2: Build + test**

Run: `~/.cargo/bin/cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -20` → clean (the `watch_file` dead-code warning is gone now).
Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6` → 22 pass.

- [ ] **Step 3: Add the scroll-preserving reload in `src/main.js`**

Append this block at the END of `src/main.js`:
```js
// ---- Live reload (external file change) ----
async function reloadInPlace(path) {
  const y = viewport.scrollTop;
  await openPath(path);
  viewport.scrollTop = y;
}

listen("file-changed", (event) => reloadInPlace(event.payload));
```
(`openPath` reads via `read_markdown_file` and calls `render`, which rebuilds
highlight/copy/outline; capturing/restoring `viewport.scrollTop` keeps the reader's
position. `viewport` and `openPath` are defined earlier in the file.)

- [ ] **Step 4: Verify**

Run: `node --check src/main.js` → no output.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/menu.rs src/main.js
git commit -m "feat: re-point watcher on open and reload in place on change"
```

---

## Task 3: Verification

**Files:** none (verification only)

- [ ] **Step 1: Headless**

Run: `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -6` → 22 pass.
Run: `~/.cargo/bin/cargo clippy --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10` → no new warnings.
Run: `node --check src/main.js` → clean.

- [ ] **Step 2: GUI smoke test (run by the human, or driven via the verify skill)**

Prep a fixture: `printf '# Live\n\nfirst version\n' > /tmp/live.md`.
Run `npm run tauri dev`, open `/tmp/live.md`. Then:
- [ ] In a terminal: `printf '# Live\n\nSECOND version with more text\n' > /tmp/live.md` → within ~½s the viewer re-renders to show "SECOND version" without any manual action.
- [ ] Scroll partway down a longer doc, append a line externally → the view reloads and **stays at roughly the same scroll position** (doesn't jump to top).
- [ ] Open a different file, then edit the FIRST file externally → no reload (watch moved); edit the now-open file → it reloads.
- [ ] Editing the open file does NOT add duplicate Open Recent entries or change the window title.
- [ ] The launch sample (no file) → editing random files does nothing.

- [ ] **Step 3: Commit any tweaks**

```bash
git add -A
git commit -m "test: verify live-reload" --allow-empty
```
