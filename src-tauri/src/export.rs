use tauri_plugin_dialog::DialogExt;

/// Wrap rendered body HTML + CSS into a standalone, light HTML document.
/// No `data-theme` attribute, so the light `:root` palette applies.
pub fn wrap_html(css: &str, body: &str) -> String {
    format!(
        "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\" />\n\
<style>\n{css}\n</style>\n</head>\n<body class=\"markdown-body\">\n{body}\n</body>\n</html>\n"
    )
}

/// Build a standalone HTML document and save it via a native save dialog.
#[tauri::command]
pub fn export_html(app: tauri::AppHandle, body: String, css: String, name: String) {
    let doc = wrap_html(&css, &body);
    app.dialog()
        .file()
        .add_filter("HTML", &["html"])
        .set_file_name(&name)
        .save_file(move |path| {
            if let Some(fp) = path {
                if let Ok(p) = fp.into_path() {
                    let _ = std::fs::write(p, doc);
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrap_html_is_standalone_and_light() {
        let out = wrap_html(".stx-keyword{color:#b5841f}", "<h1>Hi</h1>");
        assert!(out.contains("<!doctype html>"), "got: {out}");
        assert!(out.contains(".stx-keyword{color:#b5841f}"));
        assert!(out.contains("<h1>Hi</h1>"));
        assert!(out.contains("class=\"markdown-body\""));
        assert!(!out.contains("data-theme"));
    }
}
