use std::path::PathBuf;
use std::sync::Mutex;

use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_dialog::DialogExt;

use crate::recent_files::RecentFiles;

/// Build the full application menu: an app submenu (Close Window, Quit) and a
/// File submenu (Open File…, Open Recent ▸). The Open Recent submenu is
/// populated from the current recent-files list, or shows a disabled
/// "No Recent Files" item when empty.
pub fn build_app_menu<R: Runtime>(
    app: &AppHandle<R>,
    recent: &RecentFiles,
) -> tauri::Result<Menu<R>> {
    let app_menu = SubmenuBuilder::new(app, "Groot")
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let open_file = MenuItemBuilder::new("Open File…")
        .id("open_file")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;

    let mut recent_builder = SubmenuBuilder::new(app, "Open Recent");
    if recent.list().is_empty() {
        let none = MenuItemBuilder::new("No Recent Files")
            .id("no_recent")
            .enabled(false)
            .build(app)?;
        recent_builder = recent_builder.item(&none);
    } else {
        for path in recent.list() {
            let label = path.to_string_lossy().to_string();
            let item = MenuItemBuilder::new(&label).id(label.clone()).build(app)?;
            recent_builder = recent_builder.item(&item);
        }
        recent_builder = recent_builder.separator();
        let clear = MenuItemBuilder::new("Clear Recent")
            .id("clear_recent")
            .build(app)?;
        recent_builder = recent_builder.item(&clear);
    }
    let recent_submenu = recent_builder.build()?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&open_file)
        .item(&recent_submenu)
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .build()
}

/// Dispatch a menu click by item id.
pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    match id {
        "open_file" => {
            let app = app.clone();
            app.clone()
                .dialog()
                .file()
                .add_filter("Markdown", &["md", "markdown"])
                .pick_file(move |file_path| {
                    if let Some(fp) = file_path {
                        if let Ok(path) = fp.into_path() {
                            on_file_chosen(&app, path);
                        }
                    }
                });
        }
        "clear_recent" => {
            {
                let state = app.state::<Mutex<RecentFiles>>();
                state.lock().unwrap().clear();
            }
            persist_and_refresh(app);
        }
        "no_recent" => {}
        path => {
            on_file_chosen(app, PathBuf::from(path));
        }
    }
}

/// Add the chosen path to recents, persist, rebuild the menu, and tell the
/// webview to render it.
fn on_file_chosen<R: Runtime>(app: &AppHandle<R>, path: PathBuf) {
    {
        let state = app.state::<Mutex<RecentFiles>>();
        state.lock().unwrap().add(path.clone());
    }
    persist_and_refresh(app);
    let _ = app.emit("open-file", path.to_string_lossy().to_string());
}

/// Save the store to disk and rebuild + set the menu from current state.
fn persist_and_refresh<R: Runtime>(app: &AppHandle<R>) {
    let store_path = crate::recent_store_path(app);
    let menu = {
        let state = app.state::<Mutex<RecentFiles>>();
        let guard = state.lock().unwrap();
        let _ = guard.save(&store_path);
        build_app_menu(app, &guard)
    };
    if let Ok(menu) = menu {
        let _ = app.set_menu(menu);
    }
}
