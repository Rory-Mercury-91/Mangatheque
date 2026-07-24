import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/common/Modal";
import {
  fetchMalUserAnimeList,
  searchMalAnimeCatalog,
  type MalAnimeCatalogHit,
} from "@/services/tracker/malAnimeApi";
import { fetchTrackerAccessToken } from "@/services/tracker/trackerTokenService";
import "@/features/tracker/TrackerListPicker.css";

export interface AnimeMalPickerProps {
  open: boolean;
  initialQuery: string;
  onClose: () => void;
  onSelect: (malId: number) => void;
}

/**
 * @description Picker animé MAL : liste perso puis catalogue.
 */
export function AnimeMalPicker({
  open,
  initialQuery,
  onClose,
  onSelect,
}: AnimeMalPickerProps) {
  const [entries, setEntries] = useState<MalAnimeCatalogHit[]>([]);
  const [catalogEntries, setCatalogEntries] = useState<MalAnimeCatalogHit[]>(
    [],
  );
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setError(null);
    setEntries([]);
    setCatalogEntries([]);
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const token = await fetchTrackerAccessToken("mal");
        if (!token) {
          throw new Error("MyAnimeList n'est pas connecté (onglet Suivi → Trackers).");
        }
        if (cancelled) return;
        setAccessToken(token);
        const list = await fetchMalUserAnimeList(token);
        if (!cancelled) setEntries(list);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Chargement impossible.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, initialQuery]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries.slice(0, 40);
    return entries
      .filter((e) => e.title.toLowerCase().includes(needle))
      .slice(0, 40);
  }, [entries, query]);

  const handleCatalogSearch = async () => {
    if (!accessToken || !query.trim()) return;
    setCatalogLoading(true);
    setError(null);
    try {
      setCatalogEntries(await searchMalAnimeCatalog(accessToken, query.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recherche catalogue impossible.");
    } finally {
      setCatalogLoading(false);
    }
  };

  const showCatalog = filtered.length === 0 && !loading;

  return (
    <Modal
      open={open}
      title="Rechercher un animé MAL"
      onClose={onClose}
      wide
      footer={
        <button type="button" className="btn-secondary" onClick={onClose}>
          Fermer
        </button>
      }
    >
      <div className="tracker-list-picker">
        <div className="tracker-list-picker-search">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Titre…"
            aria-label="Recherche animé"
          />
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleCatalogSearch()}
            disabled={catalogLoading || !query.trim()}
          >
            Catalogue MAL
          </button>
        </div>
        {error ? <p className="tracker-list-picker-error">{error}</p> : null}
        {loading ? (
          <p className="tracker-list-picker-status">Chargement de la liste…</p>
        ) : null}
        {!loading && filtered.length > 0 ? (
          <ul className="tracker-list-picker-results">
            {filtered.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="tracker-list-picker-item"
                  onClick={() => onSelect(entry.id)}
                >
                  {entry.coverUrl ? (
                    <img src={entry.coverUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="tracker-list-picker-cover-fallback" />
                  )}
                  <span>
                    <strong>{entry.title}</strong>
                    <small>MAL #{entry.id}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {showCatalog ? (
          <>
            <p className="tracker-list-picker-status">
              Aucun match dans votre liste — utilisez Catalogue MAL.
            </p>
            {catalogLoading ? (
              <p className="tracker-list-picker-status">Recherche…</p>
            ) : null}
            <ul className="tracker-list-picker-results">
              {catalogEntries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="tracker-list-picker-item"
                    onClick={() => onSelect(entry.id)}
                  >
                    {entry.coverUrl ? (
                      <img src={entry.coverUrl} alt="" loading="lazy" />
                    ) : (
                      <span className="tracker-list-picker-cover-fallback" />
                    )}
                    <span>
                      <strong>{entry.title}</strong>
                      <small>MAL #{entry.id}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
