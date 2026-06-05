use tauri_plugin_dialog::DialogExt;

/// Write text to a path (Save to a known file).
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Failed to write {path}: {e}"))
}

/// Save-As: open a native save dialog, write the content to the chosen path,
/// and return that path (None if cancelled).
///
/// MUST be `async` so Tauri runs it on a worker thread, not the main thread:
/// `blocking_save_file()` blocks its caller, and blocking the main thread
/// freezes the whole app (the bug where Cancel hung the UI).
#[tauri::command]
pub async fn save_file_as(
    app: tauri::AppHandle,
    content: String,
    suggested_name: String,
) -> Option<String> {
    let chosen = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown"])
        .set_file_name(&suggested_name)
        .blocking_save_file()?;
    let path = chosen.into_path().ok()?;
    std::fs::write(&path, content).ok()?;
    Some(path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_file_roundtrips() {
        let mut p = std::env::temp_dir();
        p.push("groot_writefile_test.md");
        let path = p.to_string_lossy().to_string();
        write_file(path.clone(), "# Saved\n".to_string()).unwrap();
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "# Saved\n");
        let _ = std::fs::remove_file(&p);
    }
}
