use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
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
    // Canonicalize so the stored path matches the resolved paths notify reports
    // (e.g. macOS /tmp -> /private/tmp); otherwise changes are silently missed.
    let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    *app.state::<Mutex<Option<PathBuf>>>().lock().unwrap() = Some(canonical.clone());
    let dir = match canonical.parent() {
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
