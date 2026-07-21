use serde::Serialize;
use std::collections::HashMap;
use std::io::Read;

/// Réponse HTTP brute renvoyée au frontend (échange OAuth hors WebView).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OauthHttpResponse {
    pub status: u16,
    pub body: String,
}

fn build_agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(20))
        .build()
}

fn read_body(response: ureq::Response) -> Result<String, String> {
    let mut body = String::new();
    response
        .into_reader()
        .read_to_string(&mut body)
        .map_err(|e| format!("Lecture réponse OAuth impossible : {e}"))?;
    Ok(body)
}

/// Proxy HTTP POST pour l'échange de tokens tracker (MAL / AniList).
/// Contourne le CORS / Cloudflare du WebView Android.
#[tauri::command]
pub fn oauth_token_exchange(
    url: String,
    content_type: String,
    body: String,
    headers: Option<HashMap<String, String>>,
) -> Result<OauthHttpResponse, String> {
    let trimmed_url = url.trim();
    if !(trimmed_url.starts_with("https://anilist.co/")
        || trimmed_url.starts_with("https://myanimelist.net/"))
    {
        return Err("URL OAuth non autorisée.".to_string());
    }

    let agent = build_agent();
    let mut request = agent
        .post(trimmed_url)
        .set("Content-Type", content_type.trim())
        .set("Accept", "application/json")
        .set(
            "User-Agent",
            "Mozilla/5.0 (compatible; Mangatheque/1.0; +https://github.com/Rory-Mercury-91/Mangatheque)",
        );

    if let Some(extra) = headers {
        for (key, value) in extra {
            request = request.set(&key, &value);
        }
    }

    match request.send_string(&body) {
        Ok(response) => {
            let status = response.status();
            let body = read_body(response)?;
            Ok(OauthHttpResponse { status, body })
        }
        Err(ureq::Error::Status(status, response)) => {
            let body = read_body(response).unwrap_or_default();
            Ok(OauthHttpResponse { status, body })
        }
        Err(error) => Err(format!("Échange OAuth réseau impossible : {error}")),
    }
}
