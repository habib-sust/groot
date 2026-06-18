mod appearance;
mod export;
mod fileops;
mod markdown;
mod menu;
mod recent_files;
mod watcher;

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::Emitter;
use tauri::Manager;

use appearance::Appearance;
use recent_files::RecentFiles;

/// Files the OS asked us to open (via "Open With" / file associations) that
/// arrived before the frontend was ready to receive `open-file` events.
/// `ready` flips true once the frontend calls `frontend_ready`; after that,
/// `RunEvent::Opened` dispatches straight through instead of queuing here.
#[derive(Default)]
struct OpenState {
    ready: Mutex<bool>,
    pending: Mutex<Vec<PathBuf>>,
}

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

#[tauri::command]
fn set_window_title(app: tauri::AppHandle, title: String) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_title(&title);
    }
}

#[tauri::command]
fn close_main_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.destroy();
    }
}

/// Called once the frontend has registered its `open-file` listener. Marks the
/// frontend ready and flushes any files queued by `RunEvent::Opened` during
/// startup. Returns true if a file was opened, so the frontend can skip the
/// welcome sample.
#[tauri::command]
fn frontend_ready(app: tauri::AppHandle, state: tauri::State<OpenState>) -> bool {
    *state.ready.lock().unwrap() = true;
    let pending: Vec<PathBuf> = std::mem::take(&mut state.pending.lock().unwrap());
    let opened = !pending.is_empty();
    for path in pending {
        menu::open_path(&app, path);
    }
    opened
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            markdown::parse_markdown,
            markdown::read_markdown_file,
            markdown::syntax_css,
            get_appearance,
            export::export_html,
            fileops::write_file,
            fileops::save_file_as,
            set_window_title,
            close_main_window,
            frontend_ready
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
            menu::build_tray(handle)?;
            app.manage(Mutex::new(recent));
            app.manage(Mutex::new(appearance));

            let win_handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| match event {
                    tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
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
                            Some(path) => menu::open_path(&win_handle, path.clone()),
                            None => {
                                let _ = win_handle
                                    .emit("open-error", "No markdown file in the drop".to_string());
                            }
                        }
                    }
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = win_handle.emit("close-requested", ());
                    }
                    _ => {}
                });
            }

            app.manage(Mutex::new(None::<std::path::PathBuf>));
            app.manage(OpenState::default());
            let watch_state = watcher::build_watcher(app.handle());
            app.manage(Mutex::new(watch_state));

            Ok(())
        })
        .on_menu_event(|app, event| {
            menu::handle_menu_event(app, event.id().as_ref());
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        // macOS "Open With" / file-association launches deliver files here. If the
        // frontend isn't ready yet (cold start), queue them; `frontend_ready` flushes.
        .run(|app, event| {
            if let tauri::RunEvent::Opened { urls } = event {
                let state = app.state::<OpenState>();
                let ready = *state.ready.lock().unwrap();
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        if ready {
                            menu::open_path(app, path);
                        } else {
                            state.pending.lock().unwrap().push(path);
                        }
                    }
                }
            }
        });
}
