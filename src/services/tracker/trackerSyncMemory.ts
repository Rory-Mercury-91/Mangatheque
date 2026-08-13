import { getSupabaseClient } from "@/lib/supabaseClient";
import type { TrackerSyncField } from "@/types/tracker";
import type { TrackerFieldSyncMemory } from "@/utils/trackerSyncMerge";

const STORAGE_PREFIX = "mangatheque.tracker.syncMemory.v1.";

type WorkMemory = {
  chapters?: TrackerFieldSyncMemory;
  volumes?: TrackerFieldSyncMemory;
};

export type TrackerSyncMemoryMap = Record<string, WorkMemory>;

async function resolveUserId(): Promise<string | null> {
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/**
 * @description Charge la mémoire de sync tracker du compte connecté.
 */
export async function loadTrackerSyncMemory(): Promise<TrackerSyncMemoryMap> {
  const userId = await resolveUserId();
  if (!userId) {
    return {};
  }
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as TrackerSyncMemoryMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @description Persiste la mémoire de sync tracker.
 */
export async function saveTrackerSyncMemory(memory: TrackerSyncMemoryMap): Promise<void> {
  const userId = await resolveUserId();
  if (!userId) {
    return;
  }
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(memory));
  } catch {
    /* ignore quota */
  }
}

/**
 * @description Lit la mémoire d'un compteur pour une série.
 */
export function readFieldMemory(
  memory: TrackerSyncMemoryMap,
  workId: string,
  field: TrackerSyncField,
): TrackerFieldSyncMemory | null {
  return memory[workId]?.[field] ?? null;
}

/**
 * @description Met à jour la mémoire d'un compteur.
 */
export function patchFieldMemory(
  memory: TrackerSyncMemoryMap,
  workId: string,
  field: TrackerSyncField,
  patch: Partial<TrackerFieldSyncMemory>,
): TrackerSyncMemoryMap {
  const current = memory[workId] ?? {};
  const prev = current[field] ?? {
    autoPulledRemote: null,
    rejectedRemote: null,
    conflictShows: 0,
  };
  return {
    ...memory,
    [workId]: {
      ...current,
      [field]: { ...prev, ...patch },
    },
  };
}
