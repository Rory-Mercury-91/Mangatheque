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

fn validate_anime_page_html(html: &str) -> Result<String, String> {
    if html.contains("ul-episodes")
        || html.contains("saison-container")
        || html.contains("adkami.com/anime/")
        || html.contains("adkami.com/hentai/")
        || html.contains("adkami.com/drama/")
    {
        return Ok(html.to_string());
    }

    let lower = html.to_lowercase();
    if lower.contains("403") || lower.contains("forbidden") || lower.contains("access denied") {
        return Err("ADKami a refusé l'accès (403).".into());
    }

    Err("Fiche ADKami illisible (liste d'épisodes introuvable).".into())
}

fn validate_search_html(html: &str) -> Result<String, String> {
    if html.contains("video-item-list")
        || html.contains("lettre-pagination")
        || html.contains("video?search=")
    {
        return Ok(html.to_string());
    }

    let lower = html.to_lowercase();
    if lower.contains("429") || lower.contains("too many requests") {
        return Err("HTTP 429".into());
    }
    if lower.contains("403") || lower.contains("forbidden") || lower.contains("access denied") {
        return Err("ADKami a refusé l'accès (403).".into());
    }

    Err("Recherche ADKami illisible (page vide ou structure modifiée).".into())
}

/// Construit l'URL de recherche ADKami à partir d'un titre.
fn build_adkami_search_url(query: &str) -> Result<String, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err("Requête de recherche ADKami vide.".into());
    }
    if trimmed.chars().count() > 200 {
        return Err("Requête de recherche ADKami trop longue.".into());
    }
    let encoded = urlencoding::encode(trimmed);
    Ok(format!("https://www.adkami.com/video?search={encoded}"))
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

/// Autorise uniquement une URL fiche ADKami (`/anime|hentai|drama/{id}`).
fn validate_adkami_anime_page_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    let lower = trimmed.to_lowercase();
    if !(lower.starts_with("https://www.adkami.com/") || lower.starts_with("http://www.adkami.com/"))
    {
        return Err("URL ADKami invalide (domaine attendu www.adkami.com).".into());
    }
    if !regex_is_anime_page_path(trimmed) {
        return Err(
            "URL ADKami invalide (attendu /anime|hentai|drama/{id}).".into(),
        );
    }
    Ok(trimmed.to_string())
}

fn regex_is_anime_page_path(url: &str) -> bool {
    // Évite une dépendance regex : parse simple du chemin.
    let Some(path) = url
        .split("adkami.com")
        .nth(1)
        .map(|s| s.trim_start_matches('/'))
    else {
        return false;
    };
    let mut parts = path.split('/').filter(|p| !p.is_empty());
    let section = parts.next().unwrap_or("");
    let id = parts.next().unwrap_or("");
    matches!(section, "anime" | "hentai" | "drama")
        && !id.is_empty()
        && id.chars().all(|c| c.is_ascii_digit())
}

/// Télécharge une page ADKami via HTTP.
fn fetch_url_via_http(
    url: &str,
    validate: fn(&str) -> Result<String, String>,
) -> Result<String, String> {
    let client = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(30))
        .build();

    let response = client
        .get(url)
        .set("User-Agent", ADKAMI_USER_AGENT)
        .set(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .set("Accept-Language", "fr-FR,fr;q=0.9,en;q=0.8")
        .set("Referer", "https://www.adkami.com/")
        .call()
        .map_err(|err| match err {
            ureq::Error::Status(code, _) => format!("HTTP {code}"),
            other => format!("Téléchargement ADKami : {other}"),
        })?;

    let html = response
        .into_string()
        .map_err(|err| format!("Lecture page ADKami : {err}"))?;

    validate(&html)
}

/// Télécharge l'agenda via HTTP (desktop + mobile).
fn fetch_via_http(date: Option<&str>) -> Result<String, String> {
    let url = build_agenda_url_string(date)?;
    fetch_url_via_http(&url, validate_agenda_html)
}

#[cfg(desktop)]
async fn fetch_via_hidden_webview_url(
    app: AppHandle,
    url: String,
    validate: fn(&str) -> Result<String, String>,
    title: &str,
) -> Result<String, String> {
    let label = format!("adkami-fetch-{}", now_ms());
    let parsed = url
        .parse()
        .map_err(|err| format!("URL ADKami invalide : {err}"))?;

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<String, String>>();
    let tx = Arc::new(Mutex::new(Some(tx)));

    let tx_load = tx.clone();
    let tx_err = tx.clone();
    let app_close = app.clone();
    let label_close = label.clone();

    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .visible(false)
        .title(title)
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
                    let result = validate(&html);

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
            Err("Récupération ADKami interrompue.".into())
        }
        Err(_) => {
            if let Ok(mut guard) = tx.lock() {
                guard.take();
            }
            let _ = window.close();
            Err("Délai dépassé (page ADKami).".into())
        }
    }
}

#[cfg(desktop)]
async fn fetch_via_hidden_webview(
    app: AppHandle,
    date: Option<String>,
) -> Result<String, String> {
    let url = build_agenda_url_string(date.as_deref())?;
    fetch_via_hidden_webview_url(app, url, validate_agenda_html, "Agenda ADKami").await
}

/// Télécharge le HTML de l'agenda ADKami.
/// HTTP d'abord (mobile + PC) ; fallback WebView sur desktop si besoin.
/// `date` optionnel au format ADKami `YY-MM-DD` (lundi de la semaine).
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

/// Télécharge le HTML d'une fiche ADKami (liste d'épisodes / saisons).
/// `url` doit pointer vers `/anime|hentai|drama/{id}`.
#[tauri::command]
pub async fn fetch_adkami_anime_page_html(
    #[allow(unused_variables)] app: AppHandle,
    url: String,
) -> Result<String, String> {
    let safe_url = validate_adkami_anime_page_url(&url)?;
    let url_http = safe_url.clone();
    let http_result =
        tokio::task::spawn_blocking(move || fetch_url_via_http(&url_http, validate_anime_page_html))
            .await
            .map_err(|err| format!("Tâche HTTP fiche ADKami interrompue : {err}"))?;

    match http_result {
        Ok(html) => Ok(html),
        Err(http_err) => {
            #[cfg(desktop)]
            {
                match fetch_via_hidden_webview_url(
                    app,
                    safe_url,
                    validate_anime_page_html,
                    "Fiche ADKami",
                )
                .await
                {
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

/// Télécharge le HTML d'une recherche ADKami (`/video?search=…`).
#[tauri::command]
pub async fn fetch_adkami_search_html(
    #[allow(unused_variables)] app: AppHandle,
    query: String,
) -> Result<String, String> {
    let safe_url = build_adkami_search_url(&query)?;
    let url_http = safe_url.clone();
    let http_result =
        tokio::task::spawn_blocking(move || fetch_url_via_http(&url_http, validate_search_html))
            .await
            .map_err(|err| format!("Tâche HTTP recherche ADKami interrompue : {err}"))?;

    match http_result {
        Ok(html) => Ok(html),
        Err(http_err) => {
            #[cfg(desktop)]
            {
                match fetch_via_hidden_webview_url(
                    app,
                    safe_url,
                    validate_search_html,
                    "Recherche ADKami",
                )
                .await
                {
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
