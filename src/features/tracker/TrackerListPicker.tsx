import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/common/Modal";
import {
  fetchAniListUserMangaList,
  resolveAniListIdFromMal,
  searchAniListMangaCatalog,
} from "@/services/tracker/anilistApi";
import {
  fetchMalUserMangaList,
  searchMalMangaCatalog,
} from "@/services/tracker/malApi";
import { fetchTrackerAccessToken } from "@/services/tracker/trackerTokenService";
import type { TrackerMangaListEntry, TrackerProvider } from "@/types/tracker";
import { filterTrackerMangaList } from "@/utils/trackerListFilter";
import "./TrackerListPicker.css";

export interface TrackerListPickerSelection {
  malId: number | null;
  anilistId: number | null;
}

export interface TrackerListPickerProps {
  open: boolean;
  provider: TrackerProvider;
  /** Titre prérempli dans le champ de recherche. */
  initialQuery: string;
  onClose: () => void;
  onSelect: (selection: TrackerListPickerSelection) => void;
}

/**
 * @description Picker de série : liste perso d'abord, catalogue si aucun match.
 */
export function TrackerListPicker({
  open,
  provider,
  initialQuery,
  onClose,
  onSelect,
}: TrackerListPickerProps) {
  const [entries, setEntries] = useState<TrackerMangaListEntry[]>([]);
  const [catalogEntries, setCatalogEntries] = useState<TrackerMangaListEntry[]>(
    [],
  );
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<number | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const providerLabel = provider === "mal" ? "MyAnimeList" : "AniList";

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery(initialQuery);
    setError(null);
    setEntries([]);
    setCatalogEntries([]);
    setSelectingId(null);
    setAccessToken(null);

    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const token = await fetchTrackerAccessToken(provider);
        if (!token) {
          throw new Error(
            `${providerLabel} n'est pas connecté. Ouvrez Trackers pour lier votre compte.`,
          );
        }
        if (cancelled) {
          return;
        }
        setAccessToken(token);
        const list =
          provider === "mal"
            ? await fetchMalUserMangaList(token)
            : await fetchAniListUserMangaList(token);
        if (!cancelled) {
          setEntries(list);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Impossible de charger la liste.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, provider, initialQuery, providerLabel]);

  const { items: personalItems, showingFullListFallback } = useMemo(
    () => filterTrackerMangaList(entries, query),
    [entries, query],
  );

  const personalMatchCount = useMemo(() => {
    if (!query.trim()) {
      return entries.length;
    }
    return showingFullListFallback ? 0 : personalItems.length;
  }, [query, entries.length, showingFullListFallback, personalItems.length]);

  // Catalogue si aucun match dans la liste perso
  useEffect(() => {
    if (!open || loading || error || !accessToken) {
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < 2 || personalMatchCount > 0) {
      setCatalogEntries([]);
      setCatalogLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setCatalogLoading(true);
        try {
          const catalog =
            provider === "mal"
              ? await searchMalMangaCatalog(accessToken, trimmed)
              : await searchAniListMangaCatalog(trimmed, accessToken);
          if (!cancelled) {
            setCatalogEntries(catalog);
          }
        } catch (err) {
          if (!cancelled) {
            console.warn("Recherche catalogue tracker :", err);
            setCatalogEntries([]);
          }
        } finally {
          if (!cancelled) {
            setCatalogLoading(false);
          }
        }
      })();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    open,
    loading,
    error,
    accessToken,
    query,
    personalMatchCount,
    provider,
  ]);

  const displayItems =
    personalMatchCount > 0 ? personalItems : catalogEntries;
  const showingCatalog =
    personalMatchCount === 0 && query.trim().length >= 2;

  const handleSelect = async (entry: TrackerMangaListEntry) => {
    setSelectingId(entry.mediaId);
    setError(null);
    try {
      let malId = entry.malId;
      let anilistId = entry.anilistId;

      if (provider === "mal" && anilistId == null && malId != null) {
        try {
          anilistId = await resolveAniListIdFromMal(malId);
        } catch (err) {
          console.warn("Résolution AniList depuis MAL (picker) :", err);
        }
      }

      onSelect({ malId, anilistId });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Sélection impossible.",
      );
    } finally {
      setSelectingId(null);
    }
  };

  return (
    <Modal
      open={open}
      title={`Rechercher dans ${providerLabel}`}
      onClose={onClose}
      stacked
    >
      <div className="tracker-list-picker">
        <p className="tracker-list-picker-hint">
          D&apos;abord votre liste personnelle. Si la série n&apos;y est pas
          (suivi Mihon sur l&apos;autre tracker), recherche dans le catalogue.
        </p>

        <label className="tracker-list-picker-search">
          <span>Recherche</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Titre, synonyme…"
            autoFocus
            disabled={loading || Boolean(error && entries.length === 0)}
          />
        </label>

        {loading ? (
          <p className="tracker-list-picker-status">Chargement de la liste…</p>
        ) : null}

        {error ? <p className="tracker-list-picker-error">{error}</p> : null}

        {!loading && !error && showingCatalog && catalogLoading ? (
          <p className="tracker-list-picker-status">
            Absente de votre liste — recherche catalogue…
          </p>
        ) : null}

        {!loading && !error && showingCatalog && !catalogLoading ? (
          <p className="tracker-list-picker-status">
            Absente de votre liste perso — résultats catalogue (
            {catalogEntries.length}).
          </p>
        ) : null}

        {!loading &&
        !error &&
        !showingCatalog &&
        showingFullListFallback &&
        query.trim() ? (
          <p className="tracker-list-picker-status">
            Aucune correspondance — liste complète ({entries.length}).
          </p>
        ) : null}

        {!loading &&
        !error &&
        personalMatchCount > 0 &&
        query.trim() &&
        !showingFullListFallback ? (
          <p className="tracker-list-picker-status">
            {personalMatchCount} résultat
            {personalMatchCount > 1 ? "s" : ""} dans votre liste.
          </p>
        ) : null}

        {!loading && displayItems.length > 0 ? (
          <ul className="tracker-list-picker-results">
            {displayItems.map((entry) => (
              <li key={`${showingCatalog ? "cat" : "list"}-${entry.mediaId}`}>
                <button
                  type="button"
                  className="tracker-list-picker-item"
                  disabled={selectingId != null}
                  onClick={() => void handleSelect(entry)}
                >
                  <span className="tracker-list-picker-item-title">
                    {entry.title}
                  </span>
                  <span className="tracker-list-picker-item-meta">
                    {showingCatalog ? "Catalogue · " : ""}
                    {provider === "mal"
                      ? `MAL ${entry.mediaId}`
                      : `AniList ${entry.mediaId}${
                          entry.malId != null ? ` · MAL ${entry.malId}` : ""
                        }`}
                    {selectingId === entry.mediaId ? "…" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {!loading &&
        !error &&
        !catalogLoading &&
        entries.length === 0 &&
        catalogEntries.length === 0 ? (
          <p className="tracker-list-picker-status">
            Aucune série manga dans votre liste {providerLabel}.
            {query.trim().length >= 2
              ? " Essayez un autre titre pour le catalogue."
              : ""}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
