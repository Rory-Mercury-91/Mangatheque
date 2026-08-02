import { isSupabaseConfigured } from "@/lib/supabaseClient";

/** Alignement catalogue local ↔ Supabase : au plus une fois par heure. */
export const CATALOGUE_SYNC_INTERVAL_MS = 60 * 60 * 1000;

/** Vérifie périodiquement si une sync auto est due (app au premier plan). */
const AUTO_CHECK_MS = 60_000;

const LAST_SYNC_STORAGE_KEY = "mangatheque.catalogueSync.lastAt";

const DEBOUNCE_MS = 400;

type ReloadCallback = () => void | Promise<void>;

export type CatalogueSyncStatus = {
  lastSyncAt: number | null;
  syncing: boolean;
  nextSyncAt: number | null;
};

type StatusListener = (status: CatalogueSyncStatus) => void;

const listeners = new Set<ReloadCallback>();
const statusListeners = new Set<StatusListener>();

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let autoCheckId: number | null = null;
let hubActive = false;
let syncing = false;
/** Si true, la prochaine exécution débouncée compte comme sync catalogue (cooldown 1 h). */
let pendingMarkCatalogueSync = false;

/**
 * @description Indique si l'application est au premier plan (visible).
 * En arrière-plan (mobile inclus), aucune sync auto catalogue.
 */
export function isAppForeground(): boolean {
  if (typeof document === "undefined") {
    return true;
  }
  return document.visibilityState === "visible";
}

/**
 * @description Lit l'horodatage de la dernière sync catalogue réussie.
 */
export function getCatalogueLastSyncAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_SYNC_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

/**
 * @description Persiste l'horodatage de sync catalogue et notifie l'UI.
 */
function writeCatalogueLastSyncAt(ms: number): void {
  try {
    localStorage.setItem(LAST_SYNC_STORAGE_KEY, new Date(ms).toISOString());
  } catch {
    // Stockage indisponible : la sync fonctionne quand même pour la session.
  }
  notifyStatusListeners();
}

/**
 * @description Indique si le délai d'1 h est écoulé depuis la dernière sync.
 */
export function isCatalogueSyncDue(now = Date.now()): boolean {
  const last = getCatalogueLastSyncAt();
  if (last == null) {
    return true;
  }
  return now - last >= CATALOGUE_SYNC_INTERVAL_MS;
}

/**
 * @description Horodatage de la prochaine sync auto (null si jamais synchronisé).
 */
export function getCatalogueNextSyncAt(): number | null {
  const last = getCatalogueLastSyncAt();
  if (last == null) {
    return null;
  }
  return last + CATALOGUE_SYNC_INTERVAL_MS;
}

/**
 * @description Indique si une sync catalogue (réseau) est en cours.
 */
export function isCatalogueSyncInProgress(): boolean {
  return syncing;
}

/**
 * @description Instantané du statut sync catalogue pour l'UI.
 */
export function getCatalogueSyncStatus(): CatalogueSyncStatus {
  const lastSyncAt = getCatalogueLastSyncAt();
  return {
    lastSyncAt,
    syncing,
    nextSyncAt:
      lastSyncAt == null ? null : lastSyncAt + CATALOGUE_SYNC_INTERVAL_MS,
  };
}

/**
 * @description Abonne l'UI aux changements de statut (sync en cours, horodatage).
 */
export function subscribeCatalogueSyncStatus(
  listener: StatusListener,
): () => void {
  statusListeners.add(listener);
  listener(getCatalogueSyncStatus());
  return () => {
    statusListeners.delete(listener);
  };
}

function notifyStatusListeners(): void {
  const status = getCatalogueSyncStatus();
  for (const listener of statusListeners) {
    listener(status);
  }
}

/**
 * @description Exécute les callbacks réseau des abonnés (debounce).
 * @param markCatalogueSync - Si true, met à jour le cooldown d'1 h après succès.
 */
function scheduleReloads(markCatalogueSync: boolean): void {
  if (markCatalogueSync) {
    pendingMarkCatalogueSync = true;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    const mark = pendingMarkCatalogueSync;
    pendingMarkCatalogueSync = false;
    debounceTimer = null;
    void runReloads(mark);
  }, DEBOUNCE_MS);
}

/**
 * @description Lance les rechargements abonnés et gère le flag syncing / cooldown.
 */
async function runReloads(markCatalogueSync: boolean): Promise<void> {
  if (listeners.size === 0) {
    return;
  }

  syncing = true;
  notifyStatusListeners();

  try {
    await Promise.all(
      [...listeners].map(async (callback) => {
        try {
          await callback();
        } catch (error) {
          console.warn(
            "Sync catalogue : échec d'un abonné.",
            error instanceof Error ? error.message : error,
          );
        }
      }),
    );

    if (markCatalogueSync) {
      writeCatalogueLastSyncAt(Date.now());
    }
  } finally {
    syncing = false;
    notifyStatusListeners();
  }
}

/**
 * @description Tente une sync catalogue auto si due et app au premier plan.
 */
function tryAutoCatalogueSync(): void {
  if (!isSupabaseConfigured() || !hubActive) {
    return;
  }
  if (!isAppForeground()) {
    return;
  }
  if (syncing) {
    return;
  }
  if (!isCatalogueSyncDue()) {
    return;
  }
  scheduleReloads(true);
}

/**
 * @description Demande un rafraîchissement UI après une écriture locale (sync tracker, +1…).
 * Ne réinitialise pas le cooldown d'1 h (ce n'est pas une sync d'alignement multi-appareils).
 */
export function requestSupabaseDataReload(): void {
  if (!isAppForeground()) {
    return;
  }
  scheduleReloads(false);
}

/**
 * @description Force une sync catalogue immédiate (bouton manuel), ignore le délai d'1 h
 * et repart le timer auto à partir de maintenant.
 * @returns true si la sync a été planifiée, false si ignorée (arrière-plan / déjà en cours).
 */
export function requestManualCatalogueSync(): boolean {
  if (!isSupabaseConfigured()) {
    return false;
  }
  if (!isAppForeground()) {
    console.info(
      "Sync catalogue manuelle ignorée : application en arrière-plan.",
    );
    return false;
  }
  if (syncing) {
    return false;
  }
  scheduleReloads(true);
  return true;
}

function onVisibilityChange(): void {
  if (document.visibilityState === "visible") {
    tryAutoCatalogueSync();
    return;
  }
  // Arrière-plan : annule un reload débouncé non encore lancé.
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingMarkCatalogueSync = false;
}

/**
 * @description Démarre le hub de sync catalogue (pas de Realtime, pas de poll agressif).
 */
function startHub(): void {
  if (hubActive || !isSupabaseConfigured()) {
    return;
  }
  hubActive = true;

  document.addEventListener("visibilitychange", onVisibilityChange);
  autoCheckId = window.setInterval(() => {
    tryAutoCatalogueSync();
  }, AUTO_CHECK_MS);

  // Première sync si le délai est déjà passé (ou jamais synchronisé).
  tryAutoCatalogueSync();
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
  pendingMarkCatalogueSync = false;

  document.removeEventListener("visibilitychange", onVisibilityChange);

  if (autoCheckId !== null) {
    window.clearInterval(autoCheckId);
    autoCheckId = null;
  }
}

/**
 * @description Enregistre un callback de rafraîchissement catalogue (réseau).
 * @param callback - Fonction appelée lors d'une sync auto/manuelle ou après écriture locale.
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
