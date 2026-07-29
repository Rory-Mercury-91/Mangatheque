import { isDesktopRuntime } from "@/lib/platform";

/** Port du serveur d'import local (desktop Tauri uniquement). */
const IMPORT_BASE = "http://127.0.0.1:40000";

export interface ImportTargetContext {
  workId?: string | null;
  sourceUrl?: string | null;
  title?: string | null;
  armedAt?: number;
}

/**
 * @description Arme le contexte d'import (ID fiche Mangathèque) pour Tampermonkey.
 * No-op sur mobile : le serveur local n'existe que sur le binaire bureau.
 * @param input - workId optionnel, URL Nautiljon et titre affichés.
 */
export async function armImportTargetContext(input: {
  workId?: string | null;
  sourceUrl: string;
  title?: string | null;
}): Promise<ImportTargetContext | null> {
  const sourceUrl = input.sourceUrl.trim();
  if (!sourceUrl) {
    throw new Error("URL Nautiljon manquante pour le contexte d'import.");
  }

  // Android / iOS : pas de serveur 127.0.0.1:40000 → éviter « Failed to fetch ».
  if (!isDesktopRuntime()) {
    return null;
  }

  try {
    const res = await fetch(`${IMPORT_BASE}/api/import-context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workId: input.workId?.trim() || null,
        sourceUrl,
        title: input.title?.trim() || null,
      }),
    });
    if (!res.ok) {
      throw new Error(`Contexte d'import HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      ok?: boolean;
      context?: ImportTargetContext | null;
    };
    return data.context ?? null;
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? err.message
        : "Impossible d'armer le contexte d'import (app bureau requise).",
    );
  }
}

/**
 * @description Efface le contexte d'import armé côté serveur local.
 */
export async function clearImportTargetContext(): Promise<void> {
  if (!isDesktopRuntime()) {
    return;
  }
  try {
    await fetch(`${IMPORT_BASE}/api/import-context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear: true }),
    });
  } catch {
    /* serveur absent : ignoré */
  }
}
