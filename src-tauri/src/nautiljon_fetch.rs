use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const NAUTILJON_PLANNING: &str = "https://www.nautiljon.com/planning/manga/";
const NAUTILJON_HOME: &str = "https://www.nautiljon.com/";

const DEFAULT_USER_AGENT: &str = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

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

fn is_access_denied_message(message: &str) -> bool {
    let lower = message.to_lowercase();
    lower.contains("403")
        || lower.contains("forbidden")
        || lower.contains("refusé")
        || lower.contains("refuse")
}

fn collect_set_cookies(response: &ureq::Response) -> String {
    let mut cookies = Vec::new();
    for name in response.headers_names() {
        if name.eq_ignore_ascii_case("set-cookie") {
            if let Some(value) = response.header(&name) {
                let chunk = value.split(';').next().unwrap_or(value).trim();
                if !chunk.is_empty() {
                    cookies.push(chunk.to_string());
                }
            }
        }
    }
    cookies.join("; ")
}

/// Télécharge le planning via HTTP natif (sans CORS WebView).
fn fetch_planning_via_http(user_agent: &str) -> Result<String, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(25))
        .redirects(5)
        .build();

    let home = agent
        .get(NAUTILJON_HOME)
        .set("User-Agent", user_agent)
        .set(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        )
        .set("Accept-Language", "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7")
        .set("Upgrade-Insecure-Requests", "1")
        .call()
        .map_err(|err| format!("Connexion Nautiljon impossible : {err}"))?;

    let cookie_header = collect_set_cookies(&home);
    std::thread::sleep(Duration::from_millis(350));

    let mut request = agent
        .get(NAUTILJON_PLANNING)
        .set("User-Agent", user_agent)
        .set(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        )
        .set("Accept-Language", "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7")
        .set("Referer", NAUTILJON_HOME)
        .set("Upgrade-Insecure-Requests", "1")
        .set("Sec-Fetch-Dest", "document")
        .set("Sec-Fetch-Mode", "navigate")
        .set("Sec-Fetch-Site", "same-origin")
        .set("Sec-Fetch-User", "?1");

    if !cookie_header.is_empty() {
        request = request.set("Cookie", &cookie_header);
    }

    let response = request
        .call()
        .map_err(|err| format!("Connexion Nautiljon impossible : {err}"))?;

    let status = response.status();
    if status != 200 {
        return Err(format!("Nautiljon HTTP {status}"));
    }

    let html = response
        .into_string()
        .map_err(|err| format!("Lecture planning Nautiljon : {err}"))?;

    validate_planning_html(&html)
}

fn resolve_main_webview(app: &AppHandle) -> Option<WebviewWindow> {
    app.webview_windows()
        .into_values()
        .find(|window| !window.label().starts_with("nautiljon-fetch-"))
}

fn refocus_main_webview(app: &AppHandle) {
    if let Some(main) = resolve_main_webview(app) {
        let _ = main.set_focus();
    }
}

async fn fetch_via_hidden_webview(app: AppHandle) -> Result<String, String> {
    let label = format!("nautiljon-fetch-{}", now_ms());
    let url = NAUTILJON_PLANNING
        .parse()
        .map_err(|err| format!("URL Nautiljon invalide : {err}"))?;

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<String, String>>();
    let tx = Arc::new(Mutex::new(Some(tx)));

    let tx_load = tx.clone();
    let tx_err = tx.clone();
    let app_close = app.clone();
    let label_close = label.clone();

    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url))
        .visible(false)
        .title("Planning Nautiljon");

    #[cfg(desktop)]
    {
        builder = builder
            .inner_size(800.0, 600.0)
            .skip_taskbar(true);
    }

    let window = builder
        .on_page_load(move |webview, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }

            let page_url = payload.url().as_str();
            if !page_url.contains("nautiljon.com") {
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
                    let result = validate_planning_html(&html);

                    if let Ok(mut guard) = tx.lock() {
                        if let Some(sender) = guard.take() {
                            let _ = sender.send(result);
                        }
                    }

                    if let Some(win) = app.get_webview_window(&window_label) {
                        let _ = win.close();
                    }

                    refocus_main_webview(&app);
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

    let result = match tokio::time::timeout(Duration::from_secs(40), rx).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => {
            let _ = window.close();
            refocus_main_webview(&app);
            Err("Récupération du planning interrompue.".into())
        }
        Err(_) => {
            if let Ok(mut guard) = tx.lock() {
                guard.take();
            }
            let _ = window.close();
            refocus_main_webview(&app);
            Err("Délai dépassé (planning Nautiljon).".into())
        }
    };

    refocus_main_webview(&app);
    result
}

/// Télécharge le HTML du planning manga Nautiljon (WebView desktop, HTTP puis WebView mobile).
#[tauri::command]
pub async fn fetch_nautiljon_planning_html(
    app: AppHandle,
    user_agent: Option<String>,
) -> Result<String, String> {
    #[cfg(desktop)]
    {
        let _ = user_agent;
        return fetch_via_hidden_webview(app).await;
    }

    #[cfg(not(desktop))]
    {
        let user_agent = user_agent
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_USER_AGENT.to_string());

        let http_result = tokio::task::spawn_blocking(move || {
            fetch_planning_via_http(&user_agent)
        })
        .await
        .map_err(|_| String::from("Tâche planning interrompue."))?;

        match http_result {
            Ok(html) => Ok(html),
            Err(err) if is_access_denied_message(&err) => fetch_via_hidden_webview(app).await,
            Err(err) => Err(err),
        }
    }
}
