import type { ScrapePayloadV1 } from "@/types/database";

/** Marqueur JSON collé par le userscript Tampermonkey (secours Firefox). */
export const CLIPBOARD_IMPORT_MARKER = "mangathequeClipboardImport" as const;

const PENDING_FLAG_KEY = "mangatheque:import:clipboard-pending";
export const CLIPBOARD_IMPORT_EVENT = "mangatheque:clipboard-import";

export interface ClipboardImportEnvelope {
  mangathequeClipboardImport: 1;
  mode: "review" | "direct";
  payloads: ScrapePayloadV1[];
}

/**
 * @description Indique si l'URL deep link demande un import depuis le presse-papiers.
 */
export function isImportClipboardDeepLink(url: string): boolean {
  return /^mangatheque:\/\/import-clipboard/i.test(url.trim());
}

/**
 * @description Mémorise qu'un import presse-papiers est attendu (cold start).
 */
export function markClipboardImportPending(): void {
  try {
    localStorage.setItem(PENDING_FLAG_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(CLIPBOARD_IMPORT_EVENT));
  } catch {
    /* ignore */
  }
}

/**
 * @description Consomme le drapeau d'import presse-papiers en attente.
 */
export function consumeClipboardImportPending(): boolean {
  try {
    const raw = localStorage.getItem(PENDING_FLAG_KEY);
    if (!raw) return false;
    localStorage.removeItem(PENDING_FLAG_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * @description Parse le JSON d'import collé par le script Nautiljon.
 */
export function parseClipboardImportEnvelope(
  raw: string,
): ClipboardImportEnvelope | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const data = JSON.parse(text) as Partial<ClipboardImportEnvelope>;
    if (data?.mangathequeClipboardImport !== 1) {
      return null;
    }
    const payloads = Array.isArray(data.payloads)
      ? data.payloads
      : data.payloads
        ? [data.payloads as unknown as ScrapePayloadV1]
        : [];
    const valid = payloads.filter(
      (payload) =>
        payload &&
        typeof payload === "object" &&
        Number((payload as ScrapePayloadV1).schemaVersion) === 1 &&
        typeof (payload as ScrapePayloadV1).title === "string",
    );
    if (valid.length === 0) {
      return null;
    }
    return {
      mangathequeClipboardImport: 1,
      mode: data.mode === "direct" ? "direct" : "review",
      payloads: valid,
    };
  } catch {
    return null;
  }
}

/**
 * @description Lit le presse-papiers et retourne une enveloppe d'import valide.
 */
export async function readClipboardImportEnvelope(): Promise<ClipboardImportEnvelope | null> {
  try {
    if (!navigator.clipboard?.readText) {
      return null;
    }
    const text = await navigator.clipboard.readText();
    return parseClipboardImportEnvelope(text);
  } catch (error) {
    console.warn("[import] Lecture presse-papiers impossible :", error);
    return null;
  }
}
