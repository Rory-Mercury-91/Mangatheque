//! Persistance position / taille / maximisé de la fenêtre principale (desktop).

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Size, WebviewWindow};
use tauri::WindowEvent;

const MIN_RESTORE_WIDTH: u32 = 800;
const MIN_RESTORE_HEIGHT: u32 = 560;

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct WindowLayoutFile {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

fn app_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|err| format!("Dossier config : {err:?}"))?;
    fs::create_dir_all(&config_dir).ok();
    Ok(config_dir)
}

fn window_layout_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join("window_layout.json"))
}

fn persist_window_layout(window: &WebviewWindow) -> Result<(), String> {
    let app = window.app_handle();
    let path = window_layout_path(&app)?;
    let maximized = window.is_maximized().unwrap_or(false);
    let position = window
        .outer_position()
        .map_err(|err| format!("Lecture position fenêtre : {err}"))?;
    let size = window
        .outer_size()
        .map_err(|err| format!("Lecture taille fenêtre : {err}"))?;
    let layout = WindowLayoutFile {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        maximized,
    };
    let json = serde_json::to_string_pretty(&layout)
        .map_err(|err| format!("Sérialisation window_layout : {err}"))?;
    fs::write(&path, json).map_err(|err| format!("Écriture window_layout : {err}"))?;
    Ok(())
}

/// Restaure la dernière géométrie utilisateur. Retourne `true` si un fichier valide a été appliqué.
fn try_apply_window_layout(window: &WebviewWindow) -> Result<bool, String> {
    let app = window.app_handle();
    let path = window_layout_path(&app)?;
    if !path.exists() {
        return Ok(false);
    }

    let raw =
        fs::read_to_string(&path).map_err(|err| format!("Lecture window_layout : {err}"))?;
    let layout: WindowLayoutFile =
        serde_json::from_str(&raw).map_err(|err| format!("Parse window_layout : {err}"))?;

    if layout.width < MIN_RESTORE_WIDTH || layout.height < MIN_RESTORE_HEIGHT {
        return Ok(false);
    }

    window
        .set_size(Size::Physical(PhysicalSize::new(layout.width, layout.height)))
        .map_err(|err| format!("set_size : {err}"))?;
    window
        .set_position(Position::Physical(PhysicalPosition::new(layout.x, layout.y)))
        .map_err(|err| format!("set_position : {err}"))?;

    if layout.maximized {
        window.maximize().ok();
    } else {
        window.unmaximize().ok();
    }

    Ok(true)
}

/// Restaure la géométrie sauvegardée et enregistre les changements (move, resize, fermeture).
pub fn restore_and_watch(window: WebviewWindow) -> Result<(), String> {
    match try_apply_window_layout(&window) {
        Ok(true) => {}
        Ok(false) => {}
        Err(err) => eprintln!("Géométrie fenêtre : {err}"),
    }

    let window_for_events = window.clone();
    window.on_window_event(move |event| {
        match event {
            WindowEvent::Resized(_)
            | WindowEvent::Moved(_)
            | WindowEvent::CloseRequested { .. } => {
                if let Err(err) = persist_window_layout(&window_for_events) {
                    eprintln!("Sauvegarde géométrie fenêtre : {err}");
                }
            }
            _ => {}
        }
    });

    Ok(())
}
