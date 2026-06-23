const DB_NAME = "mangatheque-cache";
const DB_VERSION = 2;
const STORE_NAME = "entries";
const WORK_DETAILS_STORE = "work-details";

/** Clés de cache persistées localement (IndexedDB). */
export const LOCAL_CACHE_KEYS = {
  works: "works",
  owners: "owners",
  libraryBundle: "library-bundle",
  dashboardBundle: "dashboard-bundle",
} as const;

type LocalCacheKey = (typeof LOCAL_CACHE_KEYS)[keyof typeof LOCAL_CACHE_KEYS];

interface CacheRecord<T> {
  key: LocalCacheKey;
  savedAt: number;
  payload: T;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

/**
 * @description Ouvre la base IndexedDB (no-op si indisponible).
 */
function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(WORK_DETAILS_STORE)) {
          db.createObjectStore(WORK_DETAILS_STORE, { keyPath: "workId" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn("Cache local indisponible :", request.error);
        resolve(null);
      };
    });
  }

  return dbPromise;
}

/**
 * @description Lit une entrée du cache local.
 */
export async function readLocalCache<T>(
  key: LocalCacheKey,
): Promise<T | null> {
  const db = await openCacheDb();
  if (!db) {
    return null;
  }

  return new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => {
      const record = request.result as CacheRecord<T> | undefined;
      resolve(record?.payload ?? null);
    };
    request.onerror = () => {
      console.warn(`Lecture cache « ${key} » impossible :`, request.error);
      resolve(null);
    };
  });
}

/**
 * @description Enregistre une entrée dans le cache local.
 */
export async function writeLocalCache<T>(
  key: LocalCacheKey,
  payload: T,
): Promise<void> {
  const db = await openCacheDb();
  if (!db) {
    return;
  }

  const record: CacheRecord<T> = {
    key,
    savedAt: Date.now(),
    payload,
  };

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(record);

    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.warn(`Écriture cache « ${key} » impossible :`, request.error);
      resolve();
    };
  });
}

/**
 * @description Vide tout le cache local (ex. déconnexion).
 */
export async function clearLocalDataCache(): Promise<void> {
  const db = await openCacheDb();
  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(
      [STORE_NAME, WORK_DETAILS_STORE],
      "readwrite",
    );
    transaction.objectStore(STORE_NAME).clear();
    transaction.objectStore(WORK_DETAILS_STORE).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      console.warn("Vidage du cache local impossible :", transaction.error);
      resolve();
    };
  });
}

/**
 * @description Lit une fiche série en cache (IndexedDB, clé = workId).
 */
export async function readWorkDetailCacheEntry<T>(
  workId: string,
): Promise<T | null> {
  const db = await openCacheDb();
  if (!db) {
    return null;
  }

  return new Promise((resolve) => {
    const transaction = db.transaction(WORK_DETAILS_STORE, "readonly");
    const request = transaction.objectStore(WORK_DETAILS_STORE).get(workId);

    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => {
      console.warn(`Lecture cache fiche « ${workId} » impossible :`, request.error);
      resolve(null);
    };
  });
}

/**
 * @description Enregistre une fiche série en cache.
 */
export async function writeWorkDetailCacheEntry<T extends { workId: string }>(
  entry: T,
): Promise<void> {
  const db = await openCacheDb();
  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(WORK_DETAILS_STORE, "readwrite");
    const request = transaction.objectStore(WORK_DETAILS_STORE).put(entry);

    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.warn(
        `Écriture cache fiche « ${entry.workId} » impossible :`,
        request.error,
      );
      resolve();
    };
  });
}

/**
 * @description Supprime une fiche série du cache.
 */
export async function deleteWorkDetailCacheEntry(workId: string): Promise<void> {
  const db = await openCacheDb();
  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(WORK_DETAILS_STORE, "readwrite");
    const request = transaction.objectStore(WORK_DETAILS_STORE).delete(workId);

    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.warn(`Suppression cache fiche « ${workId} » impossible :`, request.error);
      resolve();
    };
  });
}

/**
 * @description Liste les identifiants de séries présents dans le cache fiches.
 */
export async function listWorkDetailCacheIds(): Promise<string[]> {
  const db = await openCacheDb();
  if (!db) {
    return [];
  }

  return new Promise((resolve) => {
    const transaction = db.transaction(WORK_DETAILS_STORE, "readonly");
    const request = transaction.objectStore(WORK_DETAILS_STORE).getAllKeys();

    request.onsuccess = () =>
      resolve((request.result as string[] | undefined) ?? []);
    request.onerror = () => {
      console.warn("Liste des fiches en cache impossible :", request.error);
      resolve([]);
    };
  });
}
