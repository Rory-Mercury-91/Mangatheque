#[cfg(desktop)]
use std::sync::{Arc, Mutex};
use std::time::Duration;
#[cfg(desktop)]
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(desktop)]
use tauri::webview::PageLoadEvent;
use tauri::AppHandle;
#[cfg(desktop)]
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const ADKAMI_AGENDA: &str = "https://www.adkami.com/agenda";
const ADKAMI_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

#[cfg(desktop)]
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(desktop)]
fn decode_eval_json(raw: &str) -> String {
    serde_json::from_str(raw).unwrap_or_else(|_| raw.to_string())
}

fn validate_agenda_html(html: &str) -> Result<String, String> {
    if html.contains("col-12 episode") || html.contains("data-info=") {
        return Ok(html.to_string());
    }

    let lower = html.to_lowercase();
    if lower.contains("403") || lower.contains("forbidden") || lower.contains("access denied") {
        return Err("ADKami a refusé l'accès (403).".into());
    }

    Err("Agenda ADKami illisible (page vide ou structure modifiée).".into())
}

/// Valide le paramètre `YY-MM-DD` ADKami.
fn validate_adkami_date(date: &str) -> Result<(), String> {
    let bytes = date.as_bytes();
    if bytes.len() != 8 {
        return Err("Date agenda ADKami invalide (attendu YY-MM-DD).".into());
    }
    let ok = bytes[0].is_ascii_digit()
        && bytes[1].is_ascii_digit()
        && bytes[2] == b'-'
        && bytes[3].is_ascii_digit()
        && bytes[4].is_ascii_digit()
        && bytes[5] == b'-'
        && bytes[6].is_ascii_digit()
        && bytes[7].is_ascii_digit();
    if !ok {
        return Err("Date agenda ADKami invalide (attendu YY-MM-DD).".into());
    }
    Ok(())
}

fn build_agenda_url_string(date: Option<&str>) -> Result<String, String> {
    match date {
        Some(d) if !d.is_empty() => {
            validate_adkami_date(d)?;
            Ok(format!("{ADKAMI_AGENDA}?date={d}"))
        }
        _ => Ok(ADKAMI_AGENDA.to_string()),
    }
}

/// Télécharge l'agenda via HTTP (desktop + mobile).
fn fetch_via_http(date: Option<&str>) -> Result<String, String> {
    let url = build_agenda_url_string(date)?;
    let client = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(30))
        .build();

    let response = client
        .get(&url)
        .set("User-Agent", ADKAMI_USER_AGENT)
        .set(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .set("Accept-Language", "fr-FR,fr;q=0.9,en;q=0.8")
        .set("Referer", "https://www.adkami.com/")
        .call()
        .map_err(|err| format!("Téléchargement agenda ADKami : {err}"))?;

    let html = response
        .into_string()
        .map_err(|err| format!("Lecture agenda ADKami : {err}"))?;

    validate_agenda_html(&html)
}

#[cfg(desktop)]
async fn fetch_via_hidden_webview(
    app: AppHandle,
    date: Option<String>,
) -> Result<String, String> {
    let label = format!("adkami-fetch-{}", now_ms());
    let url = build_agenda_url_string(date.as_deref())?
        .parse()
        .map_err(|err| format!("URL ADKami invalide : {err}"))?;

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<String, String>>();
    let tx = Arc::new(Mutex::new(Some(tx)));

    let tx_load = tx.clone();
    let tx_err = tx.clone();
    let app_close = app.clone();
    let label_close = label.clone();

    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url))
        .visible(false)
        .title("Agenda ADKami")
        .inner_size(1000.0, 800.0)
        .skip_taskbar(true)
        .on_page_load(move |webview, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }

            let page_url = payload.url().as_str();
            if !page_url.contains("adkami.com") {
                return;
            }

            let tx = tx_load.clone();
            let tx_err = tx_err.clone();
            let app = app_close.clone();
            let window_label = label_close.clone();

            if let Err(err) = webview.eval_with_callback(
                "document.documentElement.outerHTML",
                move |json: String| {
                    let html = decode_eval_json(&json);
                    let result = validate_agenda_html(&html);

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
                        let _ = sender.send(Err(format!("Lecture page ADKami : {err}")));
                    }
                }
            }
        })
        .build()
        .map_err(|err| format!("WebView ADKami : {err}"))?;

    match tokio::time::timeout(Duration::from_secs(45), rx).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => {
            let _ = window.close();
            Err("Récupération de l'agenda interrompue.".into())
        }
        Err(_) => {
            if let Ok(mut guard) = tx.lock() {
                guard.take();
            }
            let _ = window.close();
            Err("Délai dépassé (agenda ADKami).".into())
        }
    }
}

/// Télécharge le HTML de l'agenda ADKami.
/// HTTP d'abord (mobile + PC) ; fallback WebView sur desktop si besoin.
/// `date` optionnel au format ADKami `YY-MM-DD` (lundi de la semaine).
/// Le HTTP synchrone (`ureq`) tourne en `spawn_blocking` pour ne pas figer l'UI.
#[tauri::command]
pub async fn fetch_adkami_agenda_html(
    #[allow(unused_variables)] app: AppHandle,
    date: Option<String>,
) -> Result<String, String> {
    let date_for_http = date.clone();
    let http_result = tokio::task::spawn_blocking(move || fetch_via_http(date_for_http.as_deref()))
        .await
        .map_err(|err| format!("Tâche HTTP agenda interrompue : {err}"))?;

    match http_result {
        Ok(html) => Ok(html),
        Err(http_err) => {
            #[cfg(desktop)]
            {
                match fetch_via_hidden_webview(app, date).await {
                    Ok(html) => Ok(html),
                    Err(webview_err) => Err(format!("{http_err} — repli WebView : {webview_err}")),
                }
            }
            #[cfg(not(desktop))]
            {
                Err(http_err)
            }
        }
    }
}
