mod image_proxy;
mod import_server;

use import_server::{
    clear_pending_import, create_import_state, get_pending_import, start_import_server,
    SharedImportState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let import_state: SharedImportState = create_import_state();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(import_state.clone())
        .invoke_handler(tauri::generate_handler![
            get_pending_import,
            clear_pending_import
        ])
        .setup(move |app| {
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().handle_cli_arguments(std::env::args());
                if let Err(err) = app.deep_link().register_all() {
                    eprintln!("deep-link register_all: {err:?}");
                }
            }
            // Serveur import Tampermonkey : desktop uniquement (localhost).
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                let handle = app.handle().clone();
                start_import_server(handle, import_state.clone());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
