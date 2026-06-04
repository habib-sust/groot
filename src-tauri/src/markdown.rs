use pulldown_cmark::{html, Options, Parser};

#[tauri::command]
pub fn parse_markdown(content: String) -> Result<String, String> {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_TASKLISTS);

    let parser = Parser::new_ext(&content, options);
    let mut rendered = String::new();
    html::push_html(&mut rendered, parser);

    Ok(ammonia::clean(&rendered))
}

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
}
