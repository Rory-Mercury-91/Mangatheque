use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::time::SystemTime;

/// Télécharge une image Nautiljon avec le referer requis.
pub fn download_image(url: &str) -> Result<Vec<u8>, String> {
    let client = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(12))
        .build();

    let response = client
        .get(url)
        .set("Referer", "https://www.nautiljon.com/")
        .set(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )
        .call()
        .map_err(|e| format!("Téléchargement impossible: {}", e))?;

    let mut bytes = Vec::new();
    response
        .into_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Lecture impossible: {}", e))?;
    Ok(bytes)
}

fn cache_dir() -> Option<PathBuf> {
    let dir = dirs::data_dir()?.join("Mangatheque").join("image-cache");
    fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

fn cache_path(url: &str) -> Option<PathBuf> {
    let hash = format!("{:x}", md5::compute(url.as_bytes()));
    cache_dir().map(|dir| dir.join(hash))
}

fn cache_valid(path: &PathBuf, max_age_days: u64) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    let Ok(modified) = metadata.modified() else {
        return false;
    };
    let Ok(elapsed) = SystemTime::now().duration_since(modified) else {
        return false;
    };
    elapsed.as_secs() < max_age_days * 24 * 3600
}

fn content_type_for_url(url: &str) -> &'static str {
    let lower = url.to_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else {
        "image/webp"
    }
}

/// Récupère une image (cache disque 30 jours ou téléchargement Nautiljon).
pub fn get_image_with_cache(url: &str) -> Result<Vec<u8>, String> {
    if url.trim().is_empty() {
        return Err("URL vide".into());
    }

    if let Some(path) = cache_path(url) {
        if cache_valid(&path, 30) {
            if let Ok(cached) = fs::read(&path) {
                return Ok(cached);
            }
        }
    }

    let bytes = download_image(url)?;
    if let Some(path) = cache_path(url) {
        let _ = fs::write(&path, &bytes);
    }
    Ok(bytes)
}

#[cfg(desktop)]
mod http_proxy {
    use super::{content_type_for_url, get_image_with_cache};
    use tiny_http::{Header, Response, StatusCode};
    use urlencoding::decode;

    fn image_response(
        status: u16,
        data: Vec<u8>,
        content_type: &str,
    ) -> Response<std::io::Cursor<Vec<u8>>> {
        let mut response = Response::from_data(data).with_status_code(StatusCode(status));
        if let Ok(header) = Header::from_bytes("Content-Type", content_type) {
            response.add_header(header);
        }
        if let Ok(header) = Header::from_bytes("Access-Control-Allow-Origin", "*") {
            response.add_header(header);
        }
        if let Ok(header) = Header::from_bytes("Cache-Control", "public, max-age=2592000") {
            response.add_header(header);
        }
        response
    }

    /// Répond à GET /api/proxy-image?url=… avec cache disque 30 jours.
    pub fn handle_proxy_image(query: &str) -> Response<std::io::Cursor<Vec<u8>>> {
        let image_url = query
            .split('&')
            .find_map(|pair| {
                let mut parts = pair.splitn(2, '=');
                let key = parts.next()?;
                if key == "url" {
                    Some(parts.next().unwrap_or(""))
                } else {
                    None
                }
            })
            .unwrap_or("");

        let decoded = decode(image_url)
            .map(|v| v.into_owned())
            .unwrap_or_else(|_| image_url.to_string());

        if decoded.is_empty() {
            return image_response(400, Vec::new(), "text/plain");
        }

        match get_image_with_cache(&decoded) {
            Ok(bytes) => image_response(200, bytes, content_type_for_url(&decoded)),
            Err(_) => image_response(500, Vec::new(), "text/plain"),
        }
    }
}

#[cfg(desktop)]
pub use http_proxy::handle_proxy_image;

/// Commande Tauri — retourne une data URL pour affichage WebView mobile.
#[tauri::command]
pub fn fetch_cover_image_data_url(url: String) -> Result<String, String> {
    let bytes = get_image_with_cache(&url)?;
    let content_type = content_type_for_url(&url);
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    Ok(format!("data:{content_type};base64,{encoded}"))
}
