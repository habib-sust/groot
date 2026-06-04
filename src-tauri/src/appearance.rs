use std::path::Path;

/// User's appearance choice. Persisted as a plain string.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Appearance {
    Light,
    Dark,
    #[default]
    System,
}

impl Appearance {
    pub fn as_str(self) -> &'static str {
        match self {
            Appearance::Light => "light",
            Appearance::Dark => "dark",
            Appearance::System => "system",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s.trim() {
            "light" => Appearance::Light,
            "dark" => Appearance::Dark,
            _ => Appearance::System,
        }
    }

    /// Load from a file; missing/unknown → System.
    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .map(|s| Appearance::parse(&s))
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        std::fs::write(path, self.as_str()).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_roundtrip_and_unknown() {
        assert_eq!(Appearance::parse("light"), Appearance::Light);
        assert_eq!(Appearance::parse("dark"), Appearance::Dark);
        assert_eq!(Appearance::parse("system"), Appearance::System);
        assert_eq!(Appearance::parse("bogus"), Appearance::System);
        assert_eq!(Appearance::Dark.as_str(), "dark");
    }

    #[test]
    fn save_then_load() {
        let mut path = std::env::temp_dir();
        path.push("groot_appearance_test.txt");
        Appearance::Dark.save(&path).unwrap();
        assert_eq!(Appearance::load(&path), Appearance::Dark);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn load_missing_is_system() {
        assert_eq!(
            Appearance::load(Path::new("/no/such/groot_appearance.txt")),
            Appearance::System
        );
    }
}
