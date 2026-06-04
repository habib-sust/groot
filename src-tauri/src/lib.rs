mod appearance;
mod markdown;
mod menu;
mod recent_files;
mod watcher;

use std::sync::Mutex;

use tauri::Emitter;
use tauri::Manager;

use appearance::Appearance;
use recent_files::RecentFiles;

/// Path to the persisted recent-files JSON, inside the app config dir.
pub(crate) fn recent_store_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> std::path::PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .expect("failed to resolve app config dir");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("recent_files.json")
}

/// Path to the persisted appearance choice, inside the app config dir.
pub(crate) fn appearance_store_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> std::path::PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .expect("failed to resolve app config dir");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("appearance.txt")
}

#[tauri::command]
fn get_appearance(state: tauri::State<Mutex<Appearance>>) -> String {
    state.lock().unwrap().as_str().to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            markdown::parse_markdown,
            markdown::read_markdown_file,
            markdown::syntax_css,
            get_appearance
        ])
        .setup(|app| {
            let handle = app.handle();
            let store_path = recent_store_path(handle);
            let mut recent = RecentFiles::load(&store_path);
            recent.prune_with(|p| p.exists());
            let _ = recent.save(&store_path);
            let appearance = Appearance::load(&appearance_store_path(handle));
            let menu = menu::build_app_menu(handle, &recent, appearance)?;
            app.set_menu(menu)?;
            app.manage(Mutex::new(recent));
            app.manage(Mutex::new(appearance));

            let drag_handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) =
                        event
                    {
                        let md = paths.iter().find(|p| {
                            matches!(
                                p.extension()
                                    .and_then(|e| e.to_str())
                                    .map(|e| e.to_ascii_lowercase())
                                    .as_deref(),
                                Some("md") | Some("markdown")
                            )
                        });
                        match md {
                            Some(path) => menu::open_path(&drag_handle, path.clone()),
                            None => {
                                let _ = drag_handle
                                    .emit("open-error", "No markdown file in the drop".to_string());
                            }
                        }
                    }
                });
            }

            app.manage(Mutex::new(None::<std::path::PathBuf>));
            let watch_state = watcher::build_watcher(app.handle());
            app.manage(Mutex::new(watch_state));

            Ok(())
        })
        .on_menu_event(|app, event| {
            menu::handle_menu_event(app, event.id().as_ref());
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
