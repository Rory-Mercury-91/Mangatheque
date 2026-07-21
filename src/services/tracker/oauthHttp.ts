import { isTauriRuntime } from "@/lib/platform";

export interface OauthProxyResponse {
  status: number;
  body: string;
}

/**
 * @description POST OAuth (MAL / AniList) via proxy Rust sous Tauri, sinon fetch navigateur.
 * @param url - Endpoint token HTTPS.
 * @param contentType - Content-Type du corps.
 * @param body - Corps brut (JSON ou form-urlencoded).
 */
export async function postOauthTokenRequest(
  url: string,
  contentType: string,
  body: string,
): Promise<OauthProxyResponse> {
  if (isTauriRuntime()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<OauthProxyResponse>("oauth_token_exchange", {
      url,
      contentType,
      body,
      headers: null,
    });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      Accept: "application/json",
    },
    body,
  });

  return {
    status: response.status,
    body: await response.text(),
  };
}
