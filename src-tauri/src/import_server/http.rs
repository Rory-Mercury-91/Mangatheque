use super::{PendingImport, SharedImportState};
use crate::image_proxy;
use serde_json::{json, Value};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Method, Response, Server, StatusCode};

const IMPORT_PORT: u16 = 40000;

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn cors_headers() -> Vec<Header> {
    vec![
        Header::from_bytes(b"Access-Control-Allow-Origin", b"*").unwrap(),
        Header::from_bytes(b"Access-Control-Allow-Methods", b"GET, POST, OPTIONS")
            .unwrap(),
        Header::from_bytes(b"Access-Control-Allow-Headers", b"Content-Type")
            .unwrap(),
        Header::from_bytes(b"Content-Type", b"application/json").unwrap(),
    ]
}

fn json_response(status: u16, body: Value) -> Response<std::io::Cursor<Vec<u8>>> {
    let bytes = serde_json::to_vec(&body).unwrap_or_else(|_| b"{}".to_vec());
    let mut response = Response::from_data(bytes).with_status_code(StatusCode(status));
    for header in cors_headers() {
        response.add_header(header);
    }
    response
}

fn read_json_body(request: &mut tiny_http::Request) -> Value {
    let mut body = String::new();
    let _ = request.as_reader().read_to_string(&mut body);
    serde_json::from_str(&body).unwrap_or_else(|_| json!({}))
}

fn emit_progress(app: &AppHandle, status: &str, message: &str) {
    let _ = app.emit(
        "import-progress",
        json!({
            "status": status,
            "message": message,
            "at": now_ms(),
        }),
    );
}

/// Démarre le serveur HTTP local pour recevoir les imports Nautiljon (desktop).
pub fn start_import_server(app: AppHandle, state: SharedImportState) {
    thread::spawn(move || {
        let address = format!("127.0.0.1:{}", IMPORT_PORT);
        let server = match Server::http(&address) {
            Ok(server) => server,
            Err(_) => {
                emit_progress(
                    &app,
                    "error",
                    "Impossible de démarrer le serveur d'import (port 40000).",
                );
                return;
            }
        };

        for mut request in server.incoming_requests() {
            let full_url = request.url().to_string();
            let path = full_url.split('?').next().unwrap_or("").to_string();
            let query = full_url.split('?').nth(1).unwrap_or("");
            let method = request.method().clone();

            if method == Method::Options {
                let _ = request.respond(json_response(200, json!({ "ok": true })));
                continue;
            }

            if method == Method::Get && path == "/api/proxy-image" {
                let _ = request.respond(image_proxy::handle_proxy_image(query));
                continue;
            }

            if method != Method::Post {
                let _ = request.respond(json_response(
                    405,
                    json!({ "ok": false, "error": "Méthode non autorisée" }),
                ));
                continue;
            }

            match path.as_str() {
                "/api/import-start" => {
                    emit_progress(&app, "receiving", "Réception des données Nautiljon…");
                    let _ = request.respond(json_response(200, json!({ "ok": true })));
                }
                "/api/import-cancel" => {
                    if let Ok(mut guard) = state.lock() {
                        guard.queue.clear();
                    }
                    emit_progress(&app, "cancelled", "Import annulé.");
                    let _ = request.respond(json_response(200, json!({ "ok": true })));
                }
                "/api/import-work" => {
                    let body = read_json_body(&mut request);
                    let envelope = PendingImport {
                        payload: body.clone(),
                        received_at: now_ms(),
                    };
                    let queue_len = if let Ok(mut guard) = state.lock() {
                        guard.queue.push(envelope.clone());
                        guard.queue.len()
                    } else {
                        0
                    };
                    let title = body
                        .get("title")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Œuvre inconnue");
                    emit_progress(
                        &app,
                        "awaiting_validation",
                        &format!(
                            "Données reçues pour « {} ». Validez dans l'application.{}",
                            title,
                            if queue_len > 1 {
                                format!(" ({queue_len} en attente)")
                            } else {
                                String::new()
                            }
                        ),
                    );
                    let _ = app.emit("import-pending", envelope);
                    let _ = request.respond(json_response(
                        200,
                        json!({
                            "ok": true,
                            "queued": true,
                            "queueLength": queue_len,
                            "message": "Données reçues. Validez dans Mangathèque."
                        }),
                    ));
                }
                _ => {
                    let _ = request.respond(json_response(
                        404,
                        json!({ "ok": false, "error": "Route inconnue" }),
                    ));
                }
            }
        }
    });
}
