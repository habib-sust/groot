use pulldown_cmark::{html, Options, Parser};

#[tauri::command]
pub fn parse_markdown(content: String) -> Result<String, String> {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);

    let parser = Parser::new_ext(&content, options);
    let mut rendered = String::new();
    html::push_html(&mut rendered, parser);

    Ok(ammonia::clean(&rendered))
}

/// Reads a UTF-8 markdown file from disk. The caller (frontend) supplies the path,
/// chosen via the OS file dialog; this command will read any readable path it is given.
#[tauri::command]
pub fn read_markdown_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {path}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_heading() {
        let html = parse_markdown("# Hello".to_string()).unwrap();
        assert!(html.contains("<h1>Hello</h1>"), "got: {html}");
    }

    #[test]
    fn renders_code_block() {
        let html = parse_markdown("```\nlet x = 1;\n```".to_string()).unwrap();
        assert!(html.contains("<pre><code>"), "got: {html}");
    }

    #[test]
    fn strips_script_tags() {
        let html = parse_markdown("<script>alert('x')</script>".to_string()).unwrap();
        assert!(!html.contains("<script>"), "got: {html}");
    }

    #[test]
    fn read_missing_file_errors() {
        let result = read_markdown_file("/no/such/file-xyz.md".to_string());
        assert!(result.is_err(), "expected Err for missing file");
    }

    #[test]
    fn reads_existing_file() {
        let mut path = std::env::temp_dir();
        path.push("groot_read_test.md");
        std::fs::write(&path, "# Temp\n").unwrap();
        let content = read_markdown_file(path.to_string_lossy().to_string()).unwrap();
        assert_eq!(content, "# Temp\n");
        let _ = std::fs::remove_file(&path);
    }
}
