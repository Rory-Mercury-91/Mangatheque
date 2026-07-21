import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";

const SYNC_TABLES = [
  "owners",
  "works",
  "volumes",
  "volume_owners",
  "user_volume_reads",
  "user_work_chapter_progress",
  "user_work_reading_state",
] as const;
const DEBOUNCE_MS = 400;
const POLL_MS = 45_000;

type ReloadCallback = () => void | Promise<void>;

const listeners = new Set<ReloadCallback>();

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let channel: RealtimeChannel | null = null;
let pollId: number | null = null;
let hubActive = false;

/**
 * @description Planifie le rafraîchissement de tous les abonnés (debounce).
 */
function scheduleReloads(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    for (const callback of listeners) {
      void callback();
    }
  }, DEBOUNCE_MS);
}

/**
 * @description Demande un rafraîchissement UI après une écriture locale (sync tracker, +1…).
 * Sans ceci, les pages non abonnées au Realtime (ou avant l'événement) restent périmées.
 */
export function requestSupabaseDataReload(): void {
  scheduleReloads();
}

function onVisibilityChange(): void {
  if (document.visibilityState === "visible") {
    scheduleReloads();
  }
}

/**
 * @description Démarre le canal Realtime et les écouteurs globaux (une seule fois).
 */
function startHub(): void {
  if (hubActive || !isSupabaseConfigured()) {
    return;
  }
  hubActive = true;

  window.addEventListener("focus", scheduleReloads);
  document.addEventListener("visibilitychange", onVisibilityChange);
  pollId = window.setInterval(() => {
    if (document.visibilityState === "visible") {
      scheduleReloads();
    }
  }, POLL_MS);

  const supabase = getSupabaseClient();
  channel = supabase.channel("mangatheque-data-sync");

  for (const table of SYNC_TABLES) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      scheduleReloads,
    );
  }

  void channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      scheduleReloads();
    }
  });
}

/**
 * @description Arrête le hub quand plus aucun composant n'écoute.
 */
function stopHub(): void {
  if (!hubActive) {
    return;
  }
  hubActive = false;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  window.removeEventListener("focus", scheduleReloads);
  document.removeEventListener("visibilitychange", onVisibilityChange);

  if (pollId !== null) {
    window.clearInterval(pollId);
    pollId = null;
  }

  if (channel && isSupabaseConfigured()) {
    void getSupabaseClient().removeChannel(channel);
    channel = null;
  }
}

/**
 * @description Enregistre un callback de rafraîchissement sur le hub Realtime partagé.
 * @param callback - Fonction appelée quand les données changent.
 * @returns Désabonnement à appeler au démontage.
 */
export function registerSupabaseSyncListener(
  callback: ReloadCallback,
): () => void {
  listeners.add(callback);
  startHub();

  return () => {
    listeners.delete(callback);
    if (listeners.size === 0) {
      stopHub();
    }
  };
}
