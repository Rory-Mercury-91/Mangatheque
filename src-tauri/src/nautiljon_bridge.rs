//! Client HTTP vers un pont Nautiljon distant (ex. VM Oracle).

use std::io::Read;
use std::time::Duration;

const NAUTILJON_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/// Configuration optionnelle d'un pont distant.
#[derive(Debug, Clone)]
pub struct NautiljonBridgeConfig {
    pub base_url: String,
    pub token: String,
}

/**
 * @description Normalise l'URL de base du pont (sans slash final).
 */
pub fn normalize_bridge_base(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return None;
    }
    let lower = trimmed.to_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return None;
    }
    Some(trimmed.to_string())
}

/**
 * @description Construit une config pont si URL + token sont fournis.
 */
pub fn resolve_bridge_config(
    bridge_url: Option<&str>,
    bridge_token: Option<&str>,
) -> Option<NautiljonBridgeConfig> {
    let base = bridge_url.and_then(normalize_bridge_base)?;
    let token = bridge_token.map(str::trim).unwrap_or("").to_string();
    if token.is_empty() {
        return None;
    }
    Some(NautiljonBridgeConfig {
        base_url: base,
        token,
    })
}

fn is_allowed_target_url(url: &str) -> bool {
    let lower = url.trim().to_lowercase();
    lower.starts_with("https://www.nautiljon.com/")
        || lower.starts_with("http://www.nautiljon.com/")
        || lower.starts_with("https://nautiljon.com/")
        || lower.starts_with("http://nautiljon.com/")
}

fn looks_like_hard_block(html: &str) -> bool {
    let lower = html.to_lowercase();
    lower.contains("<title>access denied")
        || lower.contains("error code 1020")
        || lower.contains("error 1020")
        || lower.contains("403 forbidden")
        || lower.contains("you have been blocked")
        || (lower.contains("attention required") && lower.contains("cloudflare") && html.len() < 20_000)
}

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

/**
 * @description Télécharge une page Nautiljon via le pont distant.
 * @param config - URL de base + bearer token.
 * @param target_url - URL nautiljon.com à récupérer.
 */
pub fn fetch_via_bridge(
    config: &NautiljonBridgeConfig,
    target_url: &str,
) -> Result<String, String> {
    let trimmed_target = target_url.trim();
    if !is_allowed_target_url(trimmed_target) {
        return Err("URL Nautiljon invalide (domaine attendu nautiljon.com).".into());
    }

    let endpoint = format!(
        "{}/v1/fetch?url={}",
        config.base_url,
        urlencoding::encode(trimmed_target)
    );

    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(55))
        .build();

    let response = agent
        .get(&endpoint)
        .set("Authorization", &format!("Bearer {}", config.token))
        .set("X-Mangatheque-Bridge-Token", &config.token)
        .set("Accept", "text/html, application/json;q=0.8, */*;q=0.5")
        .set("User-Agent", NAUTILJON_USER_AGENT)
        .call()
        .map_err(|err| match err {
            ureq::Error::Status(code, resp) => {
                let mut body = String::new();
                let _ = resp.into_reader().read_to_string(&mut body);
                format!(
                    "Pont Nautiljon HTTP {code} : {}",
                    body.chars().take(240).collect::<String>()
                )
            }
            other => format!("Pont Nautiljon injoignable : {other}"),
        })?;

    let bridge_status = response
        .header("X-Bridge-Status")
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(200);

    let mut html = String::new();
    response
        .into_reader()
        .read_to_string(&mut html)
        .map_err(|err| format!("Lecture réponse pont impossible : {err}"))?;

    if html.trim().starts_with('{') {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&html) {
            if let Some(err) = value.get("error").and_then(|v| v.as_str()) {
                return Err(format!("Pont Nautiljon : {err}"));
            }
        }
    }

    if bridge_status == 403 || looks_like_hard_block(&html) {
        return Err(
            "Nautiljon a refusé l'accès via le pont (403 / IP bloquée côté VM)."
                .into(),
        );
    }
    if is_cloudflare_interstitial(&html) {
        return Err(
            "Cloudflare bloque encore le pont (challenge JS). Essayez plus tard ou un navigateur sur la VM."
                .into(),
        );
    }
    if html.trim().len() < 80 {
        return Err("Réponse pont Nautiljon vide ou trop courte.".into());
    }

    Ok(html)
}

/**
 * @description Ping santé du pont (`GET /health`).
 */
pub fn probe_bridge(config: &NautiljonBridgeConfig) -> Result<String, String> {
    let endpoint = format!("{}/health", config.base_url);
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(12))
        .build();

    let response = agent
        .get(&endpoint)
        .set("User-Agent", NAUTILJON_USER_AGENT)
        .call()
        .map_err(|err| format!("Pont injoignable : {err}"))?;

    let status = response.status();
    let mut body = String::new();
    response
        .into_reader()
        .read_to_string(&mut body)
        .map_err(|err| format!("Lecture /health impossible : {err}"))?;

    if status >= 400 {
        return Err(format!("Pont /health HTTP {status} : {body}"));
    }
    Ok(body)
}

/// Commande IPC : teste URL + token du pont (santé puis fetch planning).
#[tauri::command]
pub fn test_nautiljon_bridge(
    bridge_url: String,
    bridge_token: String,
) -> Result<String, String> {
    let config = resolve_bridge_config(Some(&bridge_url), Some(&bridge_token))
        .ok_or_else(|| {
            "URL ou token du pont invalide (http(s)://… + token non vide).".to_string()
        })?;

    let health = probe_bridge(&config)?;
    let html = fetch_via_bridge(
        &config,
        "https://www.nautiljon.com/planning/manga/",
    )?;

    let health_ok = health.contains("\"ok\": true") || health.contains("\"ok\":true");
    let planning_ok = html.contains("tr_col_");
    if health_ok && planning_ok {
        return Ok(
            "Pont OK : /health répond et le planning Nautiljon est lisible.".into(),
        );
    }
    if planning_ok {
        return Ok(
            "Pont OK pour Nautiljon (planning lisible). /health atypique mais fonctionnel.".into(),
        );
    }
    Err(
        "Le pont répond mais le HTML planning est illisible (structure ou blocage)."
            .into(),
    )
}
