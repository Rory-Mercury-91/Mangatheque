mod image_proxy;
mod import_server;
mod adkami_fetch;
mod local_archive;
mod local_archive_pick;
mod nautiljon_fetch;
mod oauth_proxy;
mod open_url_with;
mod secondary_webview;

#[cfg(desktop)]
mod window_layout;

use adkami_fetch::{
    fetch_adkami_agenda_html, fetch_adkami_anime_page_html, fetch_adkami_search_html,
};
use image_proxy::fetch_cover_image_data_url;
use nautiljon_fetch::{
    browse_nautiljon_fiche_html, fetch_nautiljon_page_html, fetch_nautiljon_planning_html,
    fetch_nautiljon_search_html,
};
use oauth_proxy::{oauth_token_exchange, tracker_http_request};
use local_archive::{
    local_archive_add_files, local_archive_inspect, local_archive_measure_size,
    local_archive_move, local_archive_open, local_archive_path_exists,
    local_archive_relocate,
};
use local_archive_pick::local_archive_pick_sources;
use open_url_with::open_url_with_app;
use secondary_webview::{close_nautiljon_browse_window, open_catalog_webview};

use import_server::{
    clear_pending_import, create_import_state, get_pending_import, SharedImportState,
};

#[cfg(desktop)]
use import_server::start_import_server;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebView2 : désactiver le throttle arrière-plan (scrape hors écran sans focus OS).
    #[cfg(all(desktop, windows))]
    {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling",
        );
    }

    let import_state: SharedImportState = create_import_state();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .manage(import_state.clone())
        .invoke_handler(tauri::generate_handler![
            get_pending_import,
            clear_pending_import,
            fetch_cover_image_data_url,
            fetch_nautiljon_planning_html,
            fetch_nautiljon_search_html,
            fetch_nautiljon_page_html,
            browse_nautiljon_fiche_html,
            fetch_adkami_agenda_html,
            fetch_adkami_anime_page_html,
            fetch_adkami_search_html,
            oauth_token_exchange,
            tracker_http_request,
            open_url_with_app,
            open_catalog_webview,
            close_nautiljon_browse_window,
            local_archive_inspect,
            local_archive_move,
            local_archive_open,
            local_archive_path_exists,
            local_archive_measure_size,
            local_archive_relocate,
            local_archive_add_files,
            local_archive_pick_sources
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
