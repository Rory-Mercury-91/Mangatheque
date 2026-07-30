#[cfg(desktop)]
use std::sync::{Arc, Mutex};
#[cfg(desktop)]
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[cfg(desktop)]
use tauri::webview::PageLoadEvent;
use tauri::AppHandle;
#[cfg(desktop)]
use tauri::utils::config::BackgroundThrottlingPolicy;
#[cfg(desktop)]
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(desktop)]
const NAUTILJON_PLANNING: &str = "https://www.nautiljon.com/planning/manga/";

#[cfg(desktop)]
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

/// Construit l'URL de recherche BDD Nautiljon (`/mangas|animes/?q=`).
fn build_nautiljon_bdd_search_url(query: &str, segment: &str) -> String {
    let encoded = urlencoding::encode(query);
    format!("https://www.nautiljon.com/{segment}/?q={encoded}&tri=0")
}

fn resolve_search_segment(kind: &str) -> Result<String, String> {
    match kind.trim().to_lowercase().as_str() {
        "manga" | "mangas" => Ok("mangas".into()),
        "anime" | "animes" => Ok("animes".into()),
        other => Err(format!(
            "Type de recherche Nautiljon invalide (« {other} », attendu manga ou anime)."
        )),
    }
}

/// Valide le HTML de la page recherche BDD Nautiljon (résultats ou liste vide).
/// Ne pas accepter le seul formulaire : juste après Cloudflare la page d'accueil
/// a aussi `name="q"` et fermait la WebView trop tôt.
#[cfg(desktop)]
fn validate_nautiljon_bdd_search_html(html: &str) -> Result<String, String> {
    if is_cloudflare_interstitial(html) {
        return Err("CLOUDFLARE_PENDING".into());
    }
    if looks_like_hard_block(html) {
        return Err("Nautiljon a refusé l'accès (403).".into());
    }
    let lower = html.to_lowercase();
    // Vrais résultats (cellules BDD) ou message d'absence.
    if lower.contains("left vtop")
        || lower.contains("vtop left")
        || lower.contains("aucun résultat")
        || lower.contains("aucune fiche")
        || lower.contains("pas de résultat")
    {
        return Ok(html.to_string());
    }
    // Page chargée mais résultats pas encore là / redirection post-CF.
    Err("CLOUDFLARE_PENDING".into())
}

/**
 * Essaie de valider le HTML courant ; `None` = encore en attente (Cloudflare / page partielle).
 */
#[cfg(desktop)]
fn try_validate_html(
    html: &str,
    validate: fn(&str) -> Result<String, String>,
) -> Option<Result<String, String>> {
    if html.trim().len() < 80 {
        return None;
    }
    if is_cloudflare_interstitial(html) {
        return None;
    }
    match validate(html) {
        Err(msg) if msg == "CLOUDFLARE_PENDING" => None,
        other => Some(other),
    }
}

/// Évalue une expression JS qui renvoie une string JSON.
#[cfg(desktop)]
async fn eval_js_string(window: &tauri::WebviewWindow, script: &str) -> Result<String, String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<String>();
    let tx = Arc::new(Mutex::new(Some(tx)));
    window
        .eval_with_callback(script, move |json: String| {
            if let Ok(mut guard) = tx.lock() {
                if let Some(sender) = guard.take() {
                    let _ = sender.send(decode_eval_json(&json));
                }
            }
        })
        .map_err(|err| format!("Évaluation WebView : {err}"))?;

    tokio::time::timeout(Duration::from_secs(4), rx)
        .await
        .map_err(|_| "Délai évaluation WebView.".to_string())?
        .map_err(|_| "Évaluation WebView interrompue.".to_string())
}

/// Lit le HTML via WebView.
#[cfg(desktop)]
async fn eval_document_html(window: &tauri::WebviewWindow) -> Result<String, String> {
    eval_js_string(window, "document.documentElement.outerHTML").await
}

#[cfg(desktop)]
struct WebviewFetchOptions {
    /// Afficher la fenêtre à l'écran (nécessaire pour un challenge Cloudflare manuel).
    on_screen: bool,
    /// Si l'URL courante ne contient plus ce marqueur après CF, y revenir.
    require_url_contains: Option<String>,
}

#[cfg(desktop)]
async fn fetch_via_hidden_webview_url(
    app: AppHandle,
    url: String,
    validate: fn(&str) -> Result<String, String>,
    title: &str,
) -> Result<String, String> {
    fetch_via_webview_url(
        app,
        url,
        validate,
        title,
        WebviewFetchOptions {
            on_screen: false,
            require_url_contains: None,
        },
    )
    .await
}

#[cfg(desktop)]
async fn fetch_via_webview_url(
    app: AppHandle,
    url: String,
    validate: fn(&str) -> Result<String, String>,
    title: &str,
    options: WebviewFetchOptions,
) -> Result<String, String> {
    let label = format!("nautiljon-fetch-{}", now_ms());
    let target_url = url.clone();
    let parsed = url
        .parse()
        .map_err(|err| format!("URL Nautiljon invalide : {err}"))?;

    let (tx, mut rx) = tokio::sync::oneshot::channel::<Result<String, String>>();
    let tx = Arc::new(Mutex::new(Some(tx)));

    let tx_load = tx.clone();
    let app_close = app.clone();
    let label_close = label.clone();
    let require_marker = options.require_url_contains.clone();

    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .visible(true)
        .skip_taskbar(true)
        .always_on_top(options.on_screen)
        .title(title)
        .inner_size(900.0, 700.0)
        .user_agent(NAUTILJON_USER_AGENT)
        .background_throttling(BackgroundThrottlingPolicy::Disabled);

    if options.on_screen {
        builder = builder.decorations(true).center();
    } else {
        // Hors écran : le moteur reste actif (contrairement à visible(false)).
        builder = builder
            .decorations(false)
            .position(-12000.0, -12000.0);
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
            if let Some(marker) = require_marker.as_ref() {
                if !page_url.contains(marker.as_str()) {
                    return;
                }
            }

            let tx = tx_load.clone();
            let app = app_close.clone();
            let window_label = label_close.clone();
            let webview_for_delay = webview.clone();

            tauri::async_runtime::spawn(async move {
                // Laisser le DOM se stabiliser après Cloudflare / redirect.
                tokio::time::sleep(Duration::from_millis(1500)).await;
                let Ok(html) = eval_document_html(&webview_for_delay).await else {
                    return;
                };
                let Some(result) = try_validate_html(&html, validate) else {
                    return;
                };
                if let Ok(mut guard) = tx.lock() {
                    if let Some(sender) = guard.take() {
                        let _ = sender.send(result);
                    }
                }
                if let Some(win) = app.get_webview_window(&window_label) {
                    let _ = win.close();
                }
            });
        })
        .build()
        .map_err(|err| format!("WebView Nautiljon : {err}"))?;

    let deadline = tokio::time::Instant::now() + Duration::from_secs(90);
    let mut last_error: Option<String> = None;
    let mut did_renavigate = false;
    let mut stable_ok_count: u8 = 0;

    loop {
        match rx.try_recv() {
            Ok(result) => {
                let _ = window.close();
                return result;
            }
            Err(tokio::sync::oneshot::error::TryRecvError::Closed) => {}
            Err(tokio::sync::oneshot::error::TryRecvError::Empty) => {}
        }

        if tokio::time::Instant::now() >= deadline {
            if let Ok(mut guard) = tx.lock() {
                guard.take();
            }
            let _ = window.close();
            return Err(last_error.unwrap_or_else(|| {
                "Délai dépassé (page Nautiljon / Cloudflare). Réessayez.".into()
            }));
        }

        // Après CF, Nautiljon renvoie parfois hors de l'URL ?q= — y revenir une fois.
        if let Some(marker) = options.require_url_contains.as_ref() {
            if let Ok(href) = eval_js_string(&window, "window.location.href").await {
                let on_cf = href.to_lowercase().contains("challenge")
                    || href.to_lowercase().contains("cdn-cgi");
                if !on_cf && !href.contains(marker.as_str()) && !did_renavigate {
                    did_renavigate = true;
                    let js = format!(
                        "window.location.replace({})",
                        serde_json::to_string(&target_url).unwrap_or_else(|_| {
                            format!("\"{}\"", target_url.replace('\"', "\\\""))
                        })
                    );
                    let _ = window.eval(&js);
                    tokio::time::sleep(Duration::from_millis(1200)).await;
                    continue;
                }
            }
        }

        match eval_document_html(&window).await {
            Ok(html) => match try_validate_html(&html, validate) {
                Some(result) => {
                    // Exiger 2 lectures OK d'affilée pour éviter de fermer pile après CF.
                    stable_ok_count = stable_ok_count.saturating_add(1);
                    if stable_ok_count >= 2 {
                        if let Ok(mut guard) = tx.lock() {
                            guard.take();
                        }
                        let _ = window.close();
                        return result;
                    }
                }
                None => {
                    stable_ok_count = 0;
                    last_error = Some(
                        "En attente de Cloudflare / chargement Nautiljon…".into(),
                    );
                }
            },
            Err(err) => {
                stable_ok_count = 0;
                last_error = Some(err);
            }
        }

        tokio::time::sleep(Duration::from_millis(1000)).await;
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

/// Recherche des fiches Nautiljon via la BDD Nautiljon (WebView = vrai navigateur).
/// Évite DuckDuckGo / Brave (captcha / HTTP 429 sur requêtes ureq).
#[tauri::command]
pub async fn fetch_nautiljon_search_html(
    #[allow(unused_variables)] app: AppHandle,
    query: String,
    kind: String,
) -> Result<String, String> {
    let trimmed = query.trim().to_string();
    if trimmed.is_empty() {
        return Err("Requête de recherche Nautiljon vide.".into());
    }
    if trimmed.chars().count() > 200 {
        return Err("Requête de recherche Nautiljon trop longue.".into());
    }
    let segment = resolve_search_segment(&kind)?;
    let search_url = build_nautiljon_bdd_search_url(&trimmed, &segment);

    #[cfg(desktop)]
    {
        return fetch_via_webview_url(
            app,
            search_url,
            validate_nautiljon_bdd_search_html,
            "Nautiljon — validation / recherche",
            WebviewFetchOptions {
                on_screen: true,
                require_url_contains: Some("q=".into()),
            },
        )
        .await;
    }

    #[cfg(not(desktop))]
    {
        let _ = search_url;
        Err("Recherche Nautiljon réservée à l'application bureau.".into())
    }
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
            "Tome Nautiljon (arrière-plan)",
        )
        .await;
    }

    #[cfg(not(desktop))]
    {
        let _ = url;
        Err("Import fiche Nautiljon réservé à l'application bureau.".into())
    }
}

/// Résultat d'une navigation Nautiljon guidée (recherche → fiche → import).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NautiljonBrowseFicheResult {
    pub html: String,
    pub url: String,
}

/// Indique une URL de fiche série Nautiljon (pas un tome / sous-page).
#[cfg(desktop)]
fn is_nautiljon_serie_fiche_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    if !(lower.contains("nautiljon.com")) {
        return false;
    }
    for segment in ["mangas", "animes", "manhwa", "manhua", "artbook"] {
        let needle = format!("/{segment}/");
        let Some(idx) = lower.find(&needle) else {
            continue;
        };
        let rest = &lower[idx + needle.len()..];
        if rest.is_empty() || rest.contains('/') {
            continue;
        }
        let slug = rest.split('?').next().unwrap_or(rest);
        if !slug.ends_with(".html") {
            continue;
        }
        if slug.starts_with("volume") {
            continue;
        }
        return true;
    }
    false
}

/// Script : bouton flottant « Importer » sur les fiches série.
#[cfg(desktop)]
const INJECT_IMPORT_BUTTON_JS: &str = r#"(function(){
  try {
    var href = String(location.href || '');
    var isFiche = /nautiljon\.com\/(mangas|animes|manhwa|manhua|artbook)\/[^\/?#]+\.html/i.test(href)
      && !/\/volume/i.test(href);
    var existing = document.getElementById('mangatheque-import-btn');
    if (!isFiche) {
      if (existing) existing.remove();
      return 'skip';
    }
    if (existing) return 'ok';
    var btn = document.createElement('button');
    btn.id = 'mangatheque-import-btn';
    btn.type = 'button';
    btn.textContent = 'Importer dans Mangathèque';
    btn.setAttribute('style',
      'position:fixed;bottom:24px;right:24px;z-index:2147483647;padding:14px 20px;'
      + 'font:600 15px/1.2 system-ui,Segoe UI,sans-serif;color:#fff;background:#b45309;'
      + 'border:none;border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.4);cursor:pointer;'
    );
    btn.addEventListener('click', function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      window.__mangathequeImportRequested = true;
      btn.textContent = 'Import en cours…';
      btn.disabled = true;
      btn.style.opacity = '0.85';
    }, true);
    (document.body || document.documentElement).appendChild(btn);
    return 'injected';
  } catch (e) {
    return 'err';
  }
})()"#;

/// Ouvre Nautiljon dans une WebView : l'utilisateur cherche, ouvre une fiche, clique Importer.
#[tauri::command]
pub async fn browse_nautiljon_fiche_html(
    #[allow(unused_variables)] app: AppHandle,
    query: String,
    kind: String,
) -> Result<NautiljonBrowseFicheResult, String> {
    let trimmed = query.trim().to_string();
    if trimmed.is_empty() {
        return Err("Saisissez un titre avant d'ouvrir Nautiljon.".into());
    }
    if trimmed.chars().count() > 200 {
        return Err("Titre trop long pour la recherche Nautiljon.".into());
    }
    let segment = resolve_search_segment(&kind)?;
    let search_url = build_nautiljon_bdd_search_url(&trimmed, &segment);

    #[cfg(desktop)]
    {
        return browse_nautiljon_fiche_via_webview(app, search_url).await;
    }

    #[cfg(not(desktop))]
    {
        let _ = search_url;
        Err("Navigation Nautiljon réservée à l'application bureau.".into())
    }
}

#[cfg(desktop)]
async fn browse_nautiljon_fiche_via_webview(
    app: AppHandle,
    search_url: String,
) -> Result<NautiljonBrowseFicheResult, String> {
    const LABEL: &str = "nautiljon-browse";

    if let Some(existing) = app.get_webview_window(LABEL) {
        let _ = existing.close();
        tokio::time::sleep(Duration::from_millis(200)).await;
    }

    let parsed = search_url
        .parse()
        .map_err(|err| format!("URL Nautiljon invalide : {err}"))?;

    let window = WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::External(parsed))
        .visible(true)
        .decorations(true)
        .center()
        .title("Nautiljon — choisissez une fiche puis Importer")
        .inner_size(1100.0, 800.0)
        .user_agent(NAUTILJON_USER_AGENT)
        .background_throttling(BackgroundThrottlingPolicy::Disabled)
        .on_page_load(|webview, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            let page_url = payload.url().as_str();
            if !page_url.contains("nautiljon.com") {
                return;
            }
            let webview = webview.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(500)).await;
                let _ = webview.eval(INJECT_IMPORT_BUTTON_JS);
            });
        })
        .build()
        .map_err(|err| format!("WebView Nautiljon : {err}"))?;

    let deadline = tokio::time::Instant::now() + Duration::from_secs(600);

    loop {
        if app.get_webview_window(LABEL).is_none() {
            return Err("Fenêtre Nautiljon fermée — import annulé.".into());
        }

        if tokio::time::Instant::now() >= deadline {
            let _ = window.close();
            return Err("Délai dépassé — aucune fiche importée.".into());
        }

        let _ = window.eval(INJECT_IMPORT_BUTTON_JS);

        let requested = eval_js_string(
            &window,
            "String(Boolean(window.__mangathequeImportRequested))",
        )
        .await
        .unwrap_or_else(|_| "false".into());

        if requested == "true" {
            let href = eval_js_string(&window, "window.location.href")
                .await
                .unwrap_or_default();
            if !is_nautiljon_serie_fiche_url(&href) {
                let _ = window.eval(
                    "window.__mangathequeImportRequested=false;var b=document.getElementById('mangatheque-import-btn');if(b){b.disabled=false;b.textContent='Importer dans Mangathèque';}",
                );
                tokio::time::sleep(Duration::from_millis(400)).await;
                continue;
            }

            // Laisser le DOM se stabiliser après le clic.
            tokio::time::sleep(Duration::from_millis(600)).await;

            let mut html_ok: Option<String> = None;
            for _ in 0..8 {
                match eval_document_html(&window).await {
                    Ok(html) => {
                        if let Some(Ok(valid)) = try_validate_html(&html, validate_fiche_html) {
                            html_ok = Some(valid);
                            break;
                        }
                    }
                    Err(_) => {}
                }
                tokio::time::sleep(Duration::from_millis(700)).await;
            }

            let Some(html) = html_ok else {
                let _ = window.eval(
                    "window.__mangathequeImportRequested=false;var b=document.getElementById('mangatheque-import-btn');if(b){b.disabled=false;b.textContent='Réessayer l\\'import';}",
                );
                tokio::time::sleep(Duration::from_millis(500)).await;
                continue;
            };

            let final_url = eval_js_string(&window, "window.location.href")
                .await
                .unwrap_or(href);
            // On laisse la fenêtre ouverte : la modale d'import peut rester
            // consultable à côté (catalogue Mihon dans une autre WebView).
            let _ = window.set_title("Nautiljon — fiche importée (vous pouvez la garder ouverte)");
            return Ok(NautiljonBrowseFicheResult {
                html,
                url: final_url,
            });
        }

        tokio::time::sleep(Duration::from_millis(700)).await;
    }
}
