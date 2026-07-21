use serde::Serialize;
use std::collections::HashMap;
use std::io::Read;

/// Réponse HTTP brute renvoyée au frontend (trackers hors WebView).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OauthHttpResponse {
    pub status: u16,
    pub body: String,
}

fn build_agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(25))
        .build()
}

fn read_body(response: ureq::Response) -> Result<String, String> {
    let mut body = String::new();
    response
        .into_reader()
        .read_to_string(&mut body)
        .map_err(|e| format!("Lecture réponse tracker impossible : {e}"))?;
    Ok(body)
}

fn is_allowed_tracker_url(url: &str) -> bool {
    url.starts_with("https://anilist.co/")
        || url.starts_with("https://graphql.anilist.co")
        || url.starts_with("https://myanimelist.net/")
        || url.starts_with("https://api.myanimelist.net/")
}

/// Proxy HTTP GET/POST pour OAuth + API MAL / AniList (bypass CORS WebView).
#[tauri::command]
pub fn oauth_token_exchange(
    url: String,
    content_type: String,
    body: String,
    headers: Option<HashMap<String, String>>,
) -> Result<OauthHttpResponse, String> {
    tracker_http_request(
        "POST".to_string(),
        url,
        Some(content_type),
        Some(body),
        headers,
    )
}

/// Proxy HTTP générique (GET/POST) pour les hosts MAL / AniList autorisés.
#[tauri::command]
pub fn tracker_http_request(
    method: String,
    url: String,
    content_type: Option<String>,
    body: Option<String>,
    headers: Option<HashMap<String, String>>,
) -> Result<OauthHttpResponse, String> {
    let trimmed_url = url.trim();
    if !is_allowed_tracker_url(trimmed_url) {
        return Err("URL tracker non autorisée.".to_string());
    }

    let method_upper = method.trim().to_ascii_uppercase();
    let agent = build_agent();
    let mut request = match method_upper.as_str() {
        "GET" => agent.get(trimmed_url),
        "POST" => agent.post(trimmed_url),
        "PUT" => agent.request("PUT", trimmed_url),
        "PATCH" => agent.request("PATCH", trimmed_url),
        "DELETE" => agent.request("DELETE", trimmed_url),
        _ => return Err(format!("Méthode HTTP non supportée : {method}")),
    };

    request = request
        .set("Accept", "application/json")
        .set(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        );

    if let Some(ct) = content_type {
        let trimmed = ct.trim();
        if !trimmed.is_empty() {
            request = request.set("Content-Type", trimmed);
        }
    }

    if let Some(extra) = headers {
        for (key, value) in extra {
            if key.eq_ignore_ascii_case("host") || key.eq_ignore_ascii_case("content-length") {
                continue;
            }
            request = request.set(&key, &value);
        }
    }

    let result = if method_upper == "GET" || body.as_ref().map(|b| b.is_empty()).unwrap_or(true) {
        request.call()
    } else {
        request.send_string(body.as_deref().unwrap_or(""))
    };

    match result {
        Ok(response) => {
            let status = response.status();
            let body = read_body(response)?;
            Ok(OauthHttpResponse { status, body })
        }
        Err(ureq::Error::Status(status, response)) => {
            let body = read_body(response).unwrap_or_default();
            Ok(OauthHttpResponse { status, body })
        }
        Err(error) => Err(format!("Requête tracker réseau impossible : {error}")),
    }
}
