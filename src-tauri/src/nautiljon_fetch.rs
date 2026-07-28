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

#[cfg(desktop)]
const NAUTILJON_PLANNING: &str = "https://www.nautiljon.com/planning/manga/";

const NAUTILJON_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

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

/// Indique une page interstitielle Cloudflare (à ignorer / attendre).
#[cfg(desktop)]
fn is_cloudflare_interstitial(html: &str) -> bool {
    let lower = html.to_lowercase();
    if lower.contains("<title>just a moment") {
        return true;
    }
    if lower.contains("enable javascript and cookies to continue") {
        return true;
    }
    html.len() < 12_000
        && lower.contains("cloudflare")
        && (lower.contains("cf-challenge")
            || lower.contains("challenge-platform/h/")
            || lower.contains("attention required"))
}

#[cfg(desktop)]
fn looks_like_hard_block(html: &str) -> bool {
    let lower = html.to_lowercase();
    lower.contains("<title>access denied")
        || lower.contains("error code 1020")
        || lower.contains("error 1020")
        || lower.contains("403 forbidden")
        || lower.contains("you have been blocked")
        || (lower.contains("attention required") && lower.contains("cloudflare") && html.len() < 20_000)
}

#[cfg(desktop)]
fn validate_planning_html(html: &str) -> Result<String, String> {
    if is_cloudflare_interstitial(html) {
        return Err("CLOUDFLARE_PENDING".into());
    }
    if html.contains("tr_col_") {
        return Ok(html.to_string());
    }
    if looks_like_hard_block(html) {
        return Err("Nautiljon a refusé l'accès (403).".into());
    }

    Err("Planning Nautiljon illisible (page vide ou structure modifiée).".into())
}

/// Construit l'URL DuckDuckGo HTML (`site:nautiljon.com/mangas|animes`).
fn build_nautiljon_web_search_url(query: &str, kind: &str) -> Result<String, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err("Requête de recherche Nautiljon vide.".into());
    }
    if trimmed.chars().count() > 200 {
        return Err("Requête de recherche Nautiljon trop longue.".into());
    }

    let segment = match kind.trim().to_lowercase().as_str() {
        "manga" | "mangas" => "mangas",
        "anime" | "animes" => "animes",
        other => {
            return Err(format!(
                "Type de recherche Nautiljon invalide (« {other} », attendu manga ou anime)."
            ));
        }
    };

    let q = format!("{trimmed} site:nautiljon.com/{segment}");
    let encoded = urlencoding::encode(&q);
    Ok(format!("https://html.duckduckgo.com/html/?q={encoded}"))
}

fn validate_web_search_html(html: &str) -> Result<String, String> {
    let lower = html.to_lowercase();
    if lower.contains("result__a")
        || lower.contains("nautiljon.com")
        || lower.contains("no results")
        || lower.contains("aucun résultat")
        || lower.contains("did not match")
    {
        return Ok(html.to_string());
    }
    if looks_like_http_block(html) {
        return Err("Le moteur de recherche a refusé l'accès.".into());
    }
    Err("Page de recherche web illisible.".into())
}

fn looks_like_http_block(html: &str) -> bool {
    let lower = html.to_lowercase();
    lower.contains("<title>access denied")
        || lower.contains("403 forbidden")
        || lower.contains("captcha") && html.len() < 8_000
}

/// Télécharge une page via HTTP (ureq).
fn fetch_url_via_http(
    url: &str,
    validate: fn(&str) -> Result<String, String>,
) -> Result<String, String> {
    let client = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(30))
        .build();

    let response = client
        .get(url)
        .set("User-Agent", NAUTILJON_USER_AGENT)
        .set(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .set("Accept-Language", "fr-FR,fr;q=0.9,en;q=0.8")
        .call()
        .map_err(|err| match err {
            ureq::Error::Status(code, _) => format!("HTTP {code}"),
            other => format!("Téléchargement recherche web : {other}"),
        })?;

    let html = response
        .into_string()
        .map_err(|err| format!("Lecture page de recherche : {err}"))?;

    validate(&html)
}

#[cfg(desktop)]
async fn fetch_via_hidden_webview_url(
    app: AppHandle,
    url: String,
    validate: fn(&str) -> Result<String, String>,
    title: &str,
) -> Result<String, String> {
    let label = format!("nautiljon-fetch-{}", now_ms());
    let parsed = url
        .parse()
        .map_err(|err| format!("URL Nautiljon invalide : {err}"))?;

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
        .user_agent(NAUTILJON_USER_AGENT)
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

            let webview_for_delay = webview.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(900)).await;

                if let Err(err) = webview_for_delay.eval_with_callback(
                    "document.documentElement.outerHTML",
                    move |json: String| {
                        let html = decode_eval_json(&json);

                        if is_cloudflare_interstitial(&html) {
                            return;
                        }

                        let result = match validate(&html) {
                            Err(msg) if msg == "CLOUDFLARE_PENDING" => return,
                            other => other,
                        };

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
            });
        })
        .build()
        .map_err(|err| format!("WebView Nautiljon : {err}"))?;

    match tokio::time::timeout(Duration::from_secs(60), rx).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => {
            let _ = window.close();
            Err("Récupération Nautiljon interrompue.".into())
        }
        Err(_) => {
            if let Ok(mut guard) = tx.lock() {
                guard.take();
            }
            let _ = window.close();
            Err("Délai dépassé (page Nautiljon / Cloudflare).".into())
        }
    }
}

#[cfg(desktop)]
async fn fetch_via_hidden_webview(app: AppHandle) -> Result<String, String> {
    fetch_via_hidden_webview_url(
        app,
        NAUTILJON_PLANNING.to_string(),
        validate_planning_html,
        "Planning Nautiljon",
    )
    .await
}

/// Télécharge le HTML du planning manga Nautiljon via WebView (desktop uniquement).
#[tauri::command]
pub async fn fetch_nautiljon_planning_html(
    #[allow(unused_variables)] app: AppHandle,
) -> Result<String, String> {
    #[cfg(desktop)]
    {
        return fetch_via_hidden_webview(app).await;
    }

    #[cfg(not(desktop))]
    {
        Err("Synchronisation planning Nautiljon réservée à l'application bureau.".into())
    }
}

/// Recherche des fiches Nautiljon via DuckDuckGo HTML
/// (`titre site:nautiljon.com/mangas|animes`) — contourne Cloudflare Nautiljon.
#[tauri::command]
pub async fn fetch_nautiljon_search_html(
    query: String,
    kind: String,
) -> Result<String, String> {
    let url = build_nautiljon_web_search_url(&query, &kind)?;
    tokio::task::spawn_blocking(move || fetch_url_via_http(&url, validate_web_search_html))
        .await
        .map_err(|err| format!("Tâche recherche Nautiljon interrompue : {err}"))?
}

#[cfg(desktop)]
fn validate_nautiljon_page_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    let lower = trimmed.to_lowercase();
    if !(lower.starts_with("https://www.nautiljon.com/")
        || lower.starts_with("http://www.nautiljon.com/")
        || lower.starts_with("https://nautiljon.com/")
        || lower.starts_with("http://nautiljon.com/"))
    {
        return Err("URL Nautiljon invalide (domaine attendu nautiljon.com).".into());
    }
    if !(lower.contains("/mangas/")
        || lower.contains("/animes/")
        || lower.contains("/artbook/")
        || lower.contains("/manhwa/")
        || lower.contains("/manhua/"))
    {
        return Err(
            "URL Nautiljon invalide (attendu /mangas|animes|…/{slug}.html).".into(),
        );
    }
    Ok(trimmed.to_string())
}

#[cfg(desktop)]
fn validate_fiche_html(html: &str) -> Result<String, String> {
    if is_cloudflare_interstitial(html) {
        return Err("CLOUDFLARE_PENDING".into());
    }
    if html.contains("itemprop=\"name\"")
        || html.contains("h1titre")
        || html.contains("class=\"description\"")
        || html.contains("class=\"image_fiche\"")
    {
        return Ok(html.to_string());
    }
    if looks_like_hard_block(html) {
        return Err("Nautiljon a refusé l'accès (403).".into());
    }
    Err("Fiche Nautiljon illisible (page vide ou structure modifiée).".into())
}

/// Télécharge le HTML d'une fiche Nautiljon via WebView (desktop).
#[tauri::command]
pub async fn fetch_nautiljon_page_html(
    #[allow(unused_variables)] app: AppHandle,
    url: String,
) -> Result<String, String> {
    #[cfg(desktop)]
    {
        let safe_url = validate_nautiljon_page_url(&url)?;
        return fetch_via_hidden_webview_url(
            app,
            safe_url,
            validate_fiche_html,
            "Fiche Nautiljon",
        )
        .await;
    }

    #[cfg(not(desktop))]
    {
        let _ = url;
        Err("Import fiche Nautiljon réservé à l'application bureau.".into())
    }
}
