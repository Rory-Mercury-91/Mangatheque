//! Ouverture d'URL avec un exécutable navigateur explicite (desktop).

use std::path::Path;
use std::process::Command;

/// Lance `app` avec l'URL en argument (chemins Windows avec espaces OK).
#[tauri::command]
#[cfg(desktop)]
pub fn open_url_with_app(url: String, app: String) -> Result<(), String> {
    let url = url.trim();
    let app = strip_wrapping_quotes(app.trim());
    if url.is_empty() {
        return Err("URL vide.".into());
    }
    if app.is_empty() {
        return Err("Navigateur vide.".into());
    }

    // Si c'est un chemin fichier, vérifier qu'il existe (évite un échec opaque).
    if looks_like_filesystem_path(&app) && !Path::new(&app).is_file() {
        return Err(format!("Exécutable introuvable : {app}"));
    }

    Command::new(&app)
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|err| format!("Impossible de lancer « {app} » : {err}"))
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn open_url_with_app(_url: String, _app: String) -> Result<(), String> {
    Err("Ouverture navigateur personnalisée disponible uniquement sur desktop.".into())
}

fn strip_wrapping_quotes(value: &str) -> String {
    let trimmed = value.trim();
    if (trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.len() >= 2)
        || (trimmed.starts_with('\'') && trimmed.ends_with('\'') && trimmed.len() >= 2)
    {
        return trimmed[1..trimmed.len() - 1].trim().to_string();
    }
    trimmed.to_string()
}

fn looks_like_filesystem_path(value: &str) -> bool {
    value.contains('/')
        || value.contains('\\')
        || (value.len() >= 3
            && value.as_bytes()[1] == b':'
            && (value.as_bytes()[2] == b'\\' || value.as_bytes()[2] == b'/'))
}
