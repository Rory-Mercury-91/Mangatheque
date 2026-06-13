use std::time::Duration;

const NAUTILJON_HOME: &str = "https://www.nautiljon.com/";
const NAUTILJON_PLANNING: &str = "https://www.nautiljon.com/planning/manga/";
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

fn apply_browser_headers(request: ureq::Request) -> ureq::Request {
    request
        .set("User-Agent", USER_AGENT)
        .set(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .set("Accept-Language", "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7")
}

/// Télécharge le HTML du planning manga Nautiljon (IP locale, pas datacenter cloud).
#[tauri::command]
pub fn fetch_nautiljon_planning_html() -> Result<String, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(25))
        .build();

    let _ = apply_browser_headers(agent.get(NAUTILJON_HOME)).call();

    let response = apply_browser_headers(agent.get(NAUTILJON_PLANNING))
        .set("Referer", NAUTILJON_HOME)
        .call()
        .map_err(|err| format!("Connexion Nautiljon impossible : {err}"))?;

    let status = response.status();
    if status != 200 {
        return Err(format!("Nautiljon HTTP {status}"));
    }

    response
        .into_string()
        .map_err(|err| format!("Lecture planning Nautiljon : {err}"))
}
