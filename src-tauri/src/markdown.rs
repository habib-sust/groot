use std::sync::OnceLock;

use pulldown_cmark::{CodeBlockKind, CowStr, Event, Options, Parser, Tag, TagEnd};
use std::io::Cursor;
use syntect::highlighting::{Theme, ThemeSet};
use syntect::html::{css_for_theme_with_class_style, ClassStyle, ClassedHTMLGenerator};
use syntect::parsing::SyntaxSet;
use syntect::util::LinesWithEndings;

/// Class prefix for syntect-generated span classes + matching CSS, to avoid
/// colliding with app CSS classes (e.g. `.error`).
const CLASS_STYLE: ClassStyle = ClassStyle::SpacedPrefixed { prefix: "stx-" };

fn syntax_set() -> &'static SyntaxSet {
    static SS: OnceLock<SyntaxSet> = OnceLock::new();
    SS.get_or_init(SyntaxSet::load_defaults_newlines)
}

fn theme_set() -> &'static ThemeSet {
    static TS: OnceLock<ThemeSet> = OnceLock::new();
    TS.get_or_init(ThemeSet::load_defaults)
}

/// The bundled warm "Sage & Rose" syntax theme (compiled into the binary).
const WARM_TMTHEME: &[u8] = include_bytes!("../themes/groot-warm.tmTheme");

fn theme() -> &'static Theme {
    static THEME: OnceLock<Theme> = OnceLock::new();
    THEME.get_or_init(|| {
        ThemeSet::load_from_reader(&mut Cursor::new(WARM_TMTHEME))
            .unwrap_or_else(|_| theme_set().themes["InspiredGitHub"].clone())
    })
}

/// The bundled warm-dark syntax theme, used under macOS dark mode.
const WARM_DARK_TMTHEME: &[u8] = include_bytes!("../themes/groot-warm-dark.tmTheme");

fn dark_theme() -> &'static Theme {
    static DARK: OnceLock<Theme> = OnceLock::new();
    DARK.get_or_init(|| {
        ThemeSet::load_from_reader(&mut Cursor::new(WARM_DARK_TMTHEME))
            .unwrap_or_else(|_| theme_set().themes["base16-ocean.dark"].clone())
    })
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

/// Highlight a fenced code block into `<pre><code>…classed spans…</code></pre>`.
/// Unknown language → plain text syntax. Any syntect error → escaped plain block.
fn highlight_code(lang: &str, code: &str) -> String {
    let ss = syntax_set();
    let syntax = if lang.is_empty() {
        ss.find_syntax_plain_text()
    } else {
        ss.find_syntax_by_token(lang)
            .unwrap_or_else(|| ss.find_syntax_plain_text())
    };
    let mut generator = ClassedHTMLGenerator::new_with_class_style(syntax, ss, CLASS_STYLE);
    for line in LinesWithEndings::from(code) {
        if generator
            .parse_html_for_line_which_includes_newline(line)
            .is_err()
        {
            return format!("<pre><code>{}</code></pre>", escape_html(code));
        }
    }
    format!("<pre><code>{}</code></pre>", generator.finalize())
}

/// Render markdown to sanitized HTML, with syntect-highlighted fenced code blocks.
#[tauri::command]
pub fn parse_markdown(content: String) -> Result<String, String> {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);

    let parser = Parser::new_ext(&content, options);

    let mut events: Vec<Event> = Vec::new();
    let mut in_code = false;
    let mut code_lang = String::new();
    let mut code_buf = String::new();
    for event in parser {
        match event {
            Event::Start(Tag::CodeBlock(kind)) => {
                in_code = true;
                code_buf.clear();
                code_lang = match kind {
                    CodeBlockKind::Fenced(lang) => lang.to_string(),
                    CodeBlockKind::Indented => String::new(),
                };
            }
            Event::End(TagEnd::CodeBlock) => {
                in_code = false;
                let html = highlight_code(code_lang.trim(), &code_buf);
                events.push(Event::Html(CowStr::from(html)));
            }
            Event::Text(text) if in_code => {
                code_buf.push_str(&text);
            }
            other => events.push(other),
        }
    }

    let mut rendered = String::new();
    pulldown_cmark::html::push_html(&mut rendered, events.into_iter());

    let mut builder = ammonia::Builder::default();
    builder.add_tags(["span"]);
    builder.add_tag_attributes("span", ["class"]);
    builder.add_tag_attributes("code", ["class"]);
    builder.add_tag_attributes("pre", ["class"]);
    Ok(builder.clean(&rendered).to_string())
}

/// Reads a UTF-8 markdown file from disk. The caller (frontend) supplies the path,
/// chosen via the OS file dialog; this command will read any readable path it is given.
#[tauri::command]
pub fn read_markdown_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {path}: {e}"))
}

/// CSS for syntax highlighting: the warm light theme plus the warm-dark theme
/// wrapped in a prefers-color-scheme media query. Class names match the prefix
/// used by `parse_markdown`'s highlighter.
#[tauri::command]
pub fn syntax_css() -> String {
    let light = css_for_theme_with_class_style(theme(), CLASS_STYLE).unwrap_or_default();
    let dark = css_for_theme_with_class_style(dark_theme(), CLASS_STYLE).unwrap_or_default();
    format!("{light}\n@media (prefers-color-scheme: dark) {{\n{dark}\n}}\n")
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
        assert!(html.contains("<pre"), "got: {html}");
        assert!(html.contains("<code"), "got: {html}");
    }

    #[test]
    fn strips_script_tags() {
        let html = parse_markdown("<script>alert('x')</script>".to_string()).unwrap();
        assert!(!html.contains("<script>"), "got: {html}");
    }

    #[test]
    fn highlights_known_language_with_spans() {
        let html = parse_markdown("```rust\nfn main() {}\n```".to_string()).unwrap();
        assert!(html.contains("<span class="), "expected highlighted spans, got: {html}");
    }

    #[test]
    fn unknown_language_does_not_panic_and_keeps_code() {
        let html = parse_markdown("```nosuchlang\nhello world\n```".to_string()).unwrap();
        assert!(html.contains("<pre"), "got: {html}");
        assert!(html.contains("hello world"), "code text should survive, got: {html}");
    }

    #[test]
    fn syntax_css_uses_warm_theme() {
        // The bundled warm theme uses dusty rose (#b06a7a) for strings; its presence
        // proves the bundled theme loaded (not the built-in fallback).
        let css = syntax_css().to_lowercase();
        assert!(css.contains("b06a7a"), "expected warm dusty-rose in css, got: {css}");
    }

    #[test]
    fn syntax_css_has_dark_media() {
        assert!(
            syntax_css().contains("prefers-color-scheme"),
            "syntax_css should emit a dark media block"
        );
    }

    #[test]
    fn syntax_css_dark_uses_warm_dark() {
        // The warm-dark theme uses #d98c9a for strings; presence proves it loaded.
        let css = syntax_css().to_lowercase();
        assert!(css.contains("d98c9a"), "expected warm-dark rose in css, got: {css}");
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
