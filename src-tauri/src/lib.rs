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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(import_state.clone())
        .invoke_handler(tauri::generate_handler![
            get_pending_import,
            clear_pending_import
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            start_import_server(handle, import_state.clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
