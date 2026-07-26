const STORAGE_KEY = "mangatheque.adkami.unknownContentTypes";
const AUDIO_PREF_KEY = "mangatheque.adkami.preferredAudio";

export interface AdkamiUnknownContentTypeRecord {
  code: number;
  sampleUrl: string;
  label: string;
  firstSeenAt: string;
  lastSeenAt: string;
  hitCount: number;
}

/**
 * @description Préférence audio ADKami (défaut VOSTFR).
 */
export function getAdkamiAudioPreference(): "vostfr" | "vf" {
  try {
    const raw = localStorage.getItem(AUDIO_PREF_KEY);
    return raw === "vf" ? "vf" : "vostfr";
  } catch {
    return "vostfr";
  }
}

/**
 * @description Enregistre la préférence audio ADKami.
 */
export function setAdkamiAudioPreference(value: "vostfr" | "vf"): void {
  try {
    localStorage.setItem(AUDIO_PREF_KEY, value);
  } catch {
    // ignore
  }
}

/**
 * @description Liste les types ADKami inconnus déjà signalés.
 */
export function listUnknownAdkamiContentTypes(): AdkamiUnknownContentTypeRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AdkamiUnknownContentTypeRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @description Enregistre / met à jour des types de contenu ADKami inconnus.
 */
export function recordUnknownAdkamiContentTypes(
  items: Array<{ code: number; sampleUrl: string; label: string }>,
): AdkamiUnknownContentTypeRecord[] {
  if (items.length === 0) return listUnknownAdkamiContentTypes();
  const now = new Date().toISOString();
  const byCode = new Map(
    listUnknownAdkamiContentTypes().map((row) => [row.code, row]),
  );
  for (const item of items) {
    const prev = byCode.get(item.code);
    if (prev) {
      byCode.set(item.code, {
        ...prev,
        sampleUrl: item.sampleUrl || prev.sampleUrl,
        label: item.label || prev.label,
        lastSeenAt: now,
        hitCount: prev.hitCount + 1,
      });
    } else {
      byCode.set(item.code, {
        code: item.code,
        sampleUrl: item.sampleUrl,
        label: item.label,
        firstSeenAt: now,
        lastSeenAt: now,
        hitCount: 1,
      });
    }
  }
  const next = Array.from(byCode.values()).sort((a, b) => a.code - b.code);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}
