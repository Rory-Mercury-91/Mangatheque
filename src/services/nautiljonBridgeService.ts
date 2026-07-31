import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/lib/platform";
import { resolveErrorMessage } from "@/utils/errorMessage";

const STORAGE_KEY = "mangatheque.nautiljonBridge.v1";

export interface NautiljonBridgeSettings {
  /** Active le routage des fetch Nautiljon via le pont. */
  enabled: boolean;
  /** URL de base de l'API Publisher Oracle, ex. http://138.2.182.125:8080 */
  url: string;
  /** Clé API Publisher (tr_… via /generer-cle), envoyée en X-API-KEY. */
  token: string;
}

export interface NautiljonBridgeInvokeArgs {
  bridgeUrl: string | null;
  bridgeToken: string | null;
}

const EMPTY: NautiljonBridgeSettings = {
  enabled: false,
  url: "",
  token: "",
};

/**
 * @description Lit les réglages du pont Nautiljon (localStorage).
 */
export function getNautiljonBridgeSettings(): NautiljonBridgeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<NautiljonBridgeSettings>;
    return {
      enabled: Boolean(parsed.enabled),
      url: typeof parsed.url === "string" ? parsed.url : "",
      token: typeof parsed.token === "string" ? parsed.token : "",
    };
  } catch {
    return { ...EMPTY };
  }
}

/**
 * @description Persiste les réglages du pont Nautiljon.
 * @param settings - URL, token et activation.
 */
export function setNautiljonBridgeSettings(
  settings: NautiljonBridgeSettings,
): void {
  const next: NautiljonBridgeSettings = {
    enabled: Boolean(settings.enabled),
    url: settings.url.trim(),
    token: settings.token.trim(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(
    new CustomEvent("mangatheque:nautiljon-bridge", { detail: next }),
  );
}

/**
 * @description Indique si un pont utilisable est configuré et activé.
 */
export function isNautiljonBridgeActive(
  settings: NautiljonBridgeSettings = getNautiljonBridgeSettings(),
): boolean {
  if (!settings.enabled) return false;
  const url = settings.url.trim().toLowerCase();
  if (!(url.startsWith("http://") || url.startsWith("https://"))) return false;
  return settings.token.trim().length > 0;
}

/**
 * @description Arguments IPC pour les commandes fetch Nautiljon (ou nulls si inactif).
 */
export function getNautiljonBridgeInvokeArgs(
  settings: NautiljonBridgeSettings = getNautiljonBridgeSettings(),
): NautiljonBridgeInvokeArgs {
  if (!isNautiljonBridgeActive(settings)) {
    return { bridgeUrl: null, bridgeToken: null };
  }
  return {
    bridgeUrl: settings.url.trim(),
    bridgeToken: settings.token.trim(),
  };
}

/**
 * @description Abonne un callback aux changements de réglages pont.
 * @param listener - Reçoit les nouveaux réglages.
 * @returns Fonction de désabonnement.
 */
export function subscribeNautiljonBridgeSettings(
  listener: (settings: NautiljonBridgeSettings) => void,
): () => void {
  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<NautiljonBridgeSettings>).detail;
    listener(detail ?? getNautiljonBridgeSettings());
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key == null) {
      listener(getNautiljonBridgeSettings());
    }
  };
  window.addEventListener("mangatheque:nautiljon-bridge", onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("mangatheque:nautiljon-bridge", onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * @description Teste le pont (santé + planning Nautiljon) via Rust.
 * @param settings - URL et token à tester (pas forcément encore sauvegardés).
 */
export async function testNautiljonBridge(
  settings: Pick<NautiljonBridgeSettings, "url" | "token">,
): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error("Le test du pont nécessite l'application native.");
  }
  try {
    return await invoke<string>("test_nautiljon_bridge", {
      bridgeUrl: settings.url.trim(),
      bridgeToken: settings.token.trim(),
    });
  } catch (error) {
    throw new Error(
      resolveErrorMessage(error, "Impossible de joindre le pont Nautiljon."),
    );
  }
}
