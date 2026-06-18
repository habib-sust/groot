use std::path::PathBuf;
use std::sync::Mutex;

use tauri::image::Image;
use tauri::menu::{
    CheckMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_dialog::DialogExt;

use crate::appearance::Appearance;
use crate::recent_files::RecentFiles;

/// Build the full application menu: an app submenu (Close Window, Quit) and a
/// File submenu (Open File…, Open Recent ▸). The Open Recent submenu is
/// populated from the current recent-files list, or shows a disabled
/// "No Recent Files" item when empty.
pub fn build_app_menu<R: Runtime>(
    app: &AppHandle<R>,
    recent: &RecentFiles,
    appearance: Appearance,
) -> tauri::Result<Menu<R>> {
    let app_menu = SubmenuBuilder::new(app, "Groot")
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let find_item = MenuItemBuilder::new("Find…")
        .id("find")
        .accelerator("CmdOrCtrl+F")
        .build(app)?;
    // On macOS the system clipboard/edit shortcuts (⌘V paste, ⌘X cut, ⌘Z undo…)
    // only reach the WKWebView when a predefined menu item carrying the matching
    // selector is present. Without Paste, ⌘V silently does nothing even though
    // ⌘C works — so include the full standard edit set.
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .separator()
        .item(&find_item)
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

    let export_html_item = MenuItemBuilder::new("Export as HTML…")
        .id("export_html")
        .build(app)?;
    let print_item = MenuItemBuilder::new("Print…")
        .id("print")
        .accelerator("CmdOrCtrl+P")
        .build(app)?;
    let new_item = MenuItemBuilder::new("New")
        .id("new_file")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let save_item = MenuItemBuilder::new("Save")
        .id("save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let save_as_item = MenuItemBuilder::new("Save As…")
        .id("save_as")
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_item)
        .item(&open_file)
        .item(&recent_submenu)
        .separator()
        .item(&save_item)
        .item(&save_as_item)
        .separator()
        .item(&export_html_item)
        .item(&print_item)
        .build()?;

    let appearance_menu = SubmenuBuilder::new(app, "Appearance")
        .item(
            &CheckMenuItemBuilder::new("Light")
                .id("appearance_light")
                .checked(appearance == Appearance::Light)
                .build(app)?,
        )
        .item(
            &CheckMenuItemBuilder::new("Dark")
                .id("appearance_dark")
                .checked(appearance == Appearance::Dark)
                .build(app)?,
        )
        .item(
            &CheckMenuItemBuilder::new("System")
                .id("appearance_system")
                .checked(appearance == Appearance::System)
                .build(app)?,
        )
        .build()?;
    let toggle_outline = MenuItemBuilder::new("Toggle Outline")
        .id("toggle_outline")
        .accelerator("CmdOrCtrl+Shift+O")
        .build(app)?;
    let toggle_status_bar = MenuItemBuilder::new("Toggle Status Bar")
        .id("toggle_status_bar")
        .accelerator("CmdOrCtrl+/")
        .build(app)?;
    let command_palette = MenuItemBuilder::new("Command Palette…")
        .id("command_palette")
        .accelerator("CmdOrCtrl+K")
        .build(app)?;
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&command_palette)
        .separator()
        .item(&appearance_menu)
        .separator()
        .item(&toggle_outline)
        .item(&toggle_status_bar)
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .build()
}

/// Build the macOS menu-bar (top-right status area) tray icon: a leaf glyph
/// with a small quick-actions menu. The icon is a monochrome **template** image
/// (`icon_as_template`), so macOS recolors it to match the light/dark menu bar.
/// New File / Open File… reuse the standard menu dispatch; Show / Quit are
/// handled inline.
pub fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show = MenuItemBuilder::new("Show Groot")
        .id("tray_show")
        .build(app)?;
    let new_item = MenuItemBuilder::new("New File")
        .id("new_file")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let open_item = MenuItemBuilder::new("Open File…")
        .id("open_file")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let quit = MenuItemBuilder::new("Quit Groot")
        .id("tray_quit")
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;
    let tray_menu = MenuBuilder::new(app)
        .item(&show)
        .separator()
        .item(&new_item)
        .item(&open_item)
        .separator()
        .item(&quit)
        .build()?;

    let icon = Image::from_bytes(include_bytes!("../icons/tray.png"))?;

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .icon_as_template(true)
        .tooltip("Groot")
        .menu(&tray_menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray_show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
            "tray_quit" => app.exit(0),
            other => handle_menu_event(app, other),
        })
        .build(app)?;
    Ok(())
}

/// Dispatch a menu click by item id.
pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    match id {
        "open_file" => {
            let app = app.clone();
            app.dialog()
                .file()
                .add_filter("Markdown", &["md", "markdown"])
                .pick_file(move |file_path| {
                    if let Some(fp) = file_path {
                        if let Ok(path) = fp.into_path() {
                            open_path(&app, path);
                        }
                    }
                });
        }
        "new_file" => {
            let _ = app.emit("new-file", ());
        }
        "save" => {
            let _ = app.emit("save", ());
        }
        "save_as" => {
            let _ = app.emit("save-as", ());
        }
        "clear_recent" => {
            {
                let state = app.state::<Mutex<RecentFiles>>();
                state.lock().unwrap().clear();
            }
            persist_and_refresh(app);
        }
        "find" => {
            let _ = app.emit("find", ());
        }
        "toggle_outline" => {
            let _ = app.emit("toggle-outline", ());
        }
        "toggle_status_bar" => {
            let _ = app.emit("toggle-status-bar", ());
        }
        "command_palette" => {
            let _ = app.emit("command-palette", ());
        }
        "export_html" => {
            let _ = app.emit("export-html", ());
        }
        "print" => {
            let _ = app.emit("print", ());
        }
        "no_recent" => {}
        "appearance_light" | "appearance_dark" | "appearance_system" => {
            let choice = match id {
                "appearance_light" => Appearance::Light,
                "appearance_dark" => Appearance::Dark,
                _ => Appearance::System,
            };
            {
                let state = app.state::<Mutex<Appearance>>();
                *state.lock().unwrap() = choice;
                let _ = choice.save(&crate::appearance_store_path(app));
            }
            persist_and_refresh(app);
            let _ = app.emit("appearance-changed", choice.as_str().to_string());
        }
        path => {
            let path_buf = PathBuf::from(path);
            if path_buf.exists() {
                open_path(app, path_buf);
            } else {
                {
                    let state = app.state::<Mutex<RecentFiles>>();
                    state.lock().unwrap().remove(&path_buf);
                }
                persist_and_refresh(app);
                let _ = app.emit("open-error", format!("File no longer exists: {path}"));
            }
        }
    }
}

/// Open a file: set title, add to recents, persist, rebuild menu, emit open-file.
pub fn open_path<R: Runtime>(app: &AppHandle<R>, path: PathBuf) {
    crate::watcher::watch_file(app, &path);
    {
        let state = app.state::<Mutex<RecentFiles>>();
        state.lock().unwrap().add(path.clone());
    }
    persist_and_refresh(app);
    let _ = app.emit("open-file", path.to_string_lossy().to_string());
}

/// Save the store to disk (any thread), then rebuild + set the menu on the
/// main thread. The dialog `pick_file` callback runs on a background thread,
/// and macOS menu construction (muda) must happen on the main thread.
fn persist_and_refresh<R: Runtime>(app: &AppHandle<R>) {
    let store_path = crate::recent_store_path(app);
    {
        let state = app.state::<Mutex<RecentFiles>>();
        let guard = state.lock().unwrap();
        let _ = guard.save(&store_path);
    }

    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        let appearance = *app.state::<Mutex<Appearance>>().lock().unwrap();
        let recent_state = app.state::<Mutex<RecentFiles>>();
        let recent = recent_state.lock().unwrap();
        if let Ok(menu) = build_app_menu(&app, &recent, appearance) {
            let _ = app.set_menu(menu);
        }
    });
}
