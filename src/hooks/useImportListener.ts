import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ScrapePayloadV1 } from "@/types/database";
import { isTauriRuntime } from "@/lib/platform";

export interface PendingImportEnvelope {
  payload: ScrapePayloadV1;
  received_at: number;
  /** review = ouvrir la modale · direct = import immédiat */
  mode?: "review" | "direct";
}

export interface UseImportListenerOptions {
  onImport?: (envelope: PendingImportEnvelope) => void;
}

/**
 * @description Écoute les imports Nautiljon envoyés par le serveur local Tauri.
 * @param options - Callback appelé à la réception d'un scrape.
 */
export function useImportListener({ onImport }: UseImportListenerOptions) {
  const onImportRef = useRef(onImport);
  onImportRef.current = onImport;
  const hasHandler = Boolean(onImport);

  useEffect(() => {
    if (!isTauriRuntime() || !hasHandler) {
      return;
    }

    let disposed = false;
    const unlisteners: Array<() => void> = [];

    const handleEnvelope = (envelope: PendingImportEnvelope | null) => {
      if (!envelope?.payload || envelope.payload.schemaVersion !== 1) {
        return;
      }
      onImportRef.current?.(envelope);
    };

    const setup = async () => {
      try {
        const pending = await invoke<PendingImportEnvelope | null>(
          "get_pending_import",
        );
        if (!disposed) {
          handleEnvelope(pending);
        }
      } catch {
        // Ignoré si la commande n'est pas disponible
      }

      const unlistenPending = await listen<PendingImportEnvelope>(
        "import-pending",
        (event) => {
          handleEnvelope(event.payload);
        },
      );
      unlisteners.push(unlistenPending);
    };

    void setup();

    return () => {
      disposed = true;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [hasHandler]);
}

/**
 * @description Vide la file d'import côté Tauri après validation ou annulation.
 */
export async function clearPendingImport(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  try {
    await invoke("clear_pending_import");
  } catch {
    // Ignoré hors desktop
  }
}
