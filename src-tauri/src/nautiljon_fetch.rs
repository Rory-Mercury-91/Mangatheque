use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const NAUTILJON_PLANNING: &str = "https://www.nautiljon.com/planning/manga/";

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn decode_eval_json(raw: &str) -> String {
    serde_json::from_str(raw).unwrap_or_else(|_| raw.to_string())
}

fn validate_planning_html(html: &str) -> Result<String, String> {
    if html.contains("tr_col_") {
        return Ok(html.to_string());
    }

    let lower = html.to_lowercase();
    if lower.contains("403") || lower.contains("forbidden") || lower.contains("access denied") {
        return Err("Nautiljon a refusé l'accès (403).".into());
    }

    Err("Planning Nautiljon illisible (page vide ou structure modifiée).".into())
}

async fn fetch_via_hidden_webview(app: AppHandle) -> Result<String, String> {
    let label = format!("nautiljon-fetch-{}", now_ms());
    let url = NAUTILJON_PLANNING
        .parse()
        .map_err(|err| format!("URL Nautiljon invalide : {err}"))?;

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<String, String>>();
    let tx = Arc::new(Mutex::new(Some(tx)));

    let tx_load = tx.clone();
    let app_close = app.clone();
    let label_close = label.clone();

    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url))
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .title("Planning Nautiljon")
        .inner_size(800.0, 600.0)
        .on_page_load(move |webview, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }

            let page_url = payload.url().as_str();
            if !page_url.contains("nautiljon.com") {
                return;
            }

            let tx = tx_load.clone();
            let tx_err = tx_load.clone();
            let app = app_close.clone();
            let window_label = label_close.clone();

            if let Err(err) = webview.eval_with_callback(
                "document.documentElement.outerHTML",
                move |json| {
                    let html = decode_eval_json(&json);
                    let result = validate_planning_html(&html);

                    if let Ok(mut guard) = tx.lock() {
                        if let Some(sender) = guard.take() {
                            let _ = sender.send(result);
                        }
                    }

                    if let Some(win) = app.get_webview_window(&window_label) {
                        let _ = win.close();
                    }
                },
            ) {
                if let Ok(mut guard) = tx_err.lock() {
                    if let Some(sender) = guard.take() {
                        let _ = sender.send(Err(format!("Lecture page Nautiljon : {err}")));
                    }
                }
            }
        })
        .build()
        .map_err(|err| format!("WebView Nautiljon : {err}"))?;

    match tokio::time::timeout(Duration::from_secs(40), rx).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => {
            let _ = window.close();
            Err("Récupération du planning interrompue.".into())
        }
        Err(_) => {
            if let Ok(mut guard) = tx.lock() {
                guard.take();
            }
            let _ = window.close();
            Err("Délai dépassé (planning Nautiljon).".into())
        }
    }
}

/// Télécharge le HTML du planning manga Nautiljon via WebView (contourne le blocage bot ureq).
#[tauri::command]
pub async fn fetch_nautiljon_planning_html(app: AppHandle) -> Result<String, String> {
    fetch_via_hidden_webview(app).await
}
