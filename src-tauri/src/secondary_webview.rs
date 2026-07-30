//! Fenêtre WebView secondaire (catalogue Mihon, etc.) — n'interfère pas avec Nautiljon.

use tauri::AppHandle;
#[cfg(desktop)]
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const CATALOG_LABEL: &str = "catalog-browser";

/**
 * Ouvre une URL dans une WebView dédiée (réutilise la fenêtre si déjà ouverte).
 * Ne touche pas à la WebView Nautiljon (`nautiljon-browse`).
 */
#[tauri::command]
pub async fn open_catalog_webview(
    #[allow(unused_variables)] app: AppHandle,
    url: String,
    title: Option<String>,
) -> Result<(), String> {
    let trimmed = url.trim().to_string();
    if trimmed.is_empty() {
        return Err("URL catalogue vide.".into());
    }

    #[cfg(desktop)]
    {
        let parsed = trimmed
            .parse()
            .map_err(|err| format!("URL catalogue invalide : {err}"))?;
        let window_title = title
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("Catalogue source")
            .to_string();

        if let Some(existing) = app.get_webview_window(CATALOG_LABEL) {
            let _ = existing.set_title(&window_title);
            // navigate() n'est pas toujours dispo selon la version : JS fiable.
            let js = format!(
                "window.location.href = {}",
                serde_json::to_string(&trimmed).unwrap_or_else(|_| "''".into())
            );
            existing
                .eval(&js)
                .map_err(|err| format!("Navigation catalogue : {err}"))?;
            let _ = existing.set_focus();
            let _ = existing.show();
            return Ok(());
        }

        WebviewWindowBuilder::new(&app, CATALOG_LABEL, WebviewUrl::External(parsed))
            .visible(true)
            .decorations(true)
            .center()
            .title(window_title)
            .inner_size(1000.0, 780.0)
            .build()
            .map_err(|err| format!("WebView catalogue : {err}"))?;

        return Ok(());
    }

    #[cfg(not(desktop))]
    {
        let _ = title;
        Err("WebView catalogue réservée à l'application bureau.".into())
    }
}

/**
 * Ferme la fenêtre de navigation Nautiljon guidée si elle est encore ouverte.
 */
#[tauri::command]
pub async fn close_nautiljon_browse_window(
    #[allow(unused_variables)] app: AppHandle,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if let Some(window) = app.get_webview_window("nautiljon-browse") {
            let _ = window.close();
        }
        Ok(())
    }

    #[cfg(not(desktop))]
    {
        Ok(())
    }
}
