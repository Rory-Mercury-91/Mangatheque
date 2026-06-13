use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::{Arc, Mutex};
use tauri::State;

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct ImportState {
    pub queue: Vec<PendingImport>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct PendingImport {
    pub payload: Value,
    pub received_at: u64,
}

pub type SharedImportState = Arc<Mutex<ImportState>>;

/// Crée l'état partagé de la file d'import Tampermonkey.
pub fn create_import_state() -> SharedImportState {
    Arc::new(Mutex::new(ImportState::default()))
}

#[tauri::command]
pub fn get_pending_import(state: State<'_, SharedImportState>) -> Option<PendingImport> {
    state.lock().ok()?.queue.first().cloned()
}

#[tauri::command]
pub fn clear_pending_import(state: State<'_, SharedImportState>) -> bool {
    if let Ok(mut guard) = state.lock() {
        if !guard.queue.is_empty() {
            guard.queue.remove(0);
        }
        return true;
    }
    false
}
