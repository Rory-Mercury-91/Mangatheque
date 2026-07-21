mod image_proxy;
mod import_server;
mod nautiljon_fetch;
mod oauth_proxy;

#[cfg(desktop)]
mod window_layout;

use image_proxy::fetch_cover_image_data_url;
use nautiljon_fetch::fetch_nautiljon_planning_html;
use oauth_proxy::{oauth_token_exchange, tracker_http_request};

use import_server::{
    clear_pending_import, create_import_state, get_pending_import, SharedImportState,
};

#[cfg(desktop)]
use import_server::start_import_server;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let import_state: SharedImportState = create_import_state();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(import_state.clone())
        .invoke_handler(tauri::generate_handler![
            get_pending_import,
            clear_pending_import,
            fetch_cover_image_data_url,
            fetch_nautiljon_planning_html,
            oauth_token_exchange,
            tracker_http_request
        ])
        .setup({
            #[cfg(desktop)]
            let import_state = import_state.clone();
            #[allow(unused_variables)]
            move |app| {
                #[cfg(any(windows, target_os = "linux"))]
                {
                    use tauri_plugin_deep_link::DeepLinkExt;
                    app.deep_link().handle_cli_arguments(std::env::args());
                    if let Err(err) = app.deep_link().register_all() {
                        eprintln!("deep-link register_all: {err:?}");
                    }
                }

                #[cfg(desktop)]
                {
                    use tauri::Manager;

                    if let Some(window) = app.get_webview_window("main") {
                        if let Err(err) = window_layout::restore_and_watch(window) {
                            eprintln!("Fenêtre principale : {err}");
                        }
                    }

                    start_import_server(app.handle().clone(), import_state.clone());
                }

                Ok(())
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
