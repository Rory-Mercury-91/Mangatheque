import { isTauriRuntime } from "@/lib/platform";

export interface TrackerHttpResponse {
  status: number;
  body: string;
}

/**
 * @description Requête HTTP tracker via proxy Rust sous Tauri (bypass CORS), sinon fetch.
 */
export async function trackerHttpRequest(params: {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  contentType?: string;
  body?: string;
  headers?: Record<string, string>;
}): Promise<TrackerHttpResponse> {
  if (isTauriRuntime()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<TrackerHttpResponse>("tracker_http_request", {
        method: params.method,
        url: params.url,
        contentType: params.contentType ?? null,
        body: params.body ?? null,
        headers: params.headers ?? null,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Proxy tracker indisponible.";
      throw new Error(`Requête tracker (natif) : ${message}`);
    }
  }

  try {
    const response = await fetch(params.url, {
      method: params.method,
      headers: {
        Accept: "application/json",
        ...(params.contentType
          ? { "Content-Type": params.contentType }
          : {}),
        ...(params.headers ?? {}),
      },
      body: params.body,
    });

    return {
      status: response.status,
      body: await response.text(),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "échec réseau";
    throw new Error(`Requête tracker impossible (${message}).`);
  }
}

/**
 * @description POST OAuth (MAL / AniList) via proxy Rust sous Tauri, sinon fetch navigateur.
 */
export async function postOauthTokenRequest(
  url: string,
  contentType: string,
  body: string,
): Promise<TrackerHttpResponse> {
  return trackerHttpRequest({
    method: "POST",
    url,
    contentType,
    body,
  });
}
