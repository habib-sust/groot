use std::path::{Path, PathBuf};

const MAX_RECENT: usize = 10;

/// In-memory list of recently opened file paths, most-recent-first, deduped,
/// capped at MAX_RECENT. Persisted to disk as a JSON array of paths.
#[derive(Default)]
pub struct RecentFiles {
    items: Vec<PathBuf>,
}

impl RecentFiles {
    pub fn new() -> Self {
        Self::default()
    }

    /// Insert `path` at the front, removing any existing duplicate, capped at MAX_RECENT.
    pub fn add(&mut self, path: PathBuf) {
        self.items.retain(|p| p != &path);
        self.items.insert(0, path);
        self.items.truncate(MAX_RECENT);
    }

    pub fn clear(&mut self) {
        self.items.clear();
    }

    pub fn list(&self) -> &[PathBuf] {
        &self.items
    }

    /// Load from a JSON file. A missing or corrupt file yields an empty list.
    pub fn load(path: &Path) -> Self {
        let items = std::fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str::<Vec<PathBuf>>(&s).ok())
            .unwrap_or_default();
        Self { items }
    }

    /// Serialize to a JSON file.
    pub fn save(&self, path: &Path) -> Result<(), String> {
        let json = serde_json::to_string_pretty(&self.items).map_err(|e| e.to_string())?;
        std::fs::write(path, json).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_inserts_most_recent_first() {
        let mut r = RecentFiles::new();
        r.add(PathBuf::from("/a.md"));
        r.add(PathBuf::from("/b.md"));
        assert_eq!(r.list(), &[PathBuf::from("/b.md"), PathBuf::from("/a.md")]);
    }

    #[test]
    fn add_dedups_and_moves_to_front() {
        let mut r = RecentFiles::new();
        r.add(PathBuf::from("/a.md"));
        r.add(PathBuf::from("/b.md"));
        r.add(PathBuf::from("/a.md"));
        assert_eq!(r.list(), &[PathBuf::from("/a.md"), PathBuf::from("/b.md")]);
    }

    #[test]
    fn add_caps_at_ten() {
        let mut r = RecentFiles::new();
        for i in 0..15 {
            r.add(PathBuf::from(format!("/{i}.md")));
        }
        assert_eq!(r.list().len(), 10);
        assert_eq!(r.list()[0], PathBuf::from("/14.md"));
        assert_eq!(r.list()[9], PathBuf::from("/5.md"));
    }

    #[test]
    fn clear_empties() {
        let mut r = RecentFiles::new();
        r.add(PathBuf::from("/a.md"));
        r.clear();
        assert!(r.list().is_empty());
    }

    #[test]
    fn save_then_load_roundtrip() {
        let mut r = RecentFiles::new();
        r.add(PathBuf::from("/a.md"));
        r.add(PathBuf::from("/b.md"));
        let mut path = std::env::temp_dir();
        path.push("groot_recent_roundtrip_test.json");
        r.save(&path).unwrap();
        let loaded = RecentFiles::load(&path);
        assert_eq!(loaded.list(), r.list());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn load_missing_file_is_empty() {
        let loaded = RecentFiles::load(Path::new("/no/such/groot_recent.json"));
        assert!(loaded.list().is_empty());
    }
}
