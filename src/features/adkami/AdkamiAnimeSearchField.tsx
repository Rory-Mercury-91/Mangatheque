import { useEffect, useMemo, useRef, useState } from "react";
import { formatAnimeMediaTypeLabel } from "@/constants/animeStatus";
import { resolveAnimeDisplayTitle, type Anime } from "@/types/anime";
import { normalizeTitleForComparison } from "@/utils/textNormalize";
import "./AdkamiAnimeSearchField.css";

const MAX_RESULTS = 12;

export interface AdkamiAnimeSearchFieldProps {
  /** Catalogue searchable (hors cadenas). */
  animes: Anime[];
  /** ID actuellement sélectionné. */
  selectedId: string | null;
  /** IDs déjà pris par d’autres blocs (masqués sauf sélection courante). */
  excludeIds?: ReadonlySet<string>;
  /** Autorise « aucune fiche » (OAV / films / extras). */
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  onSelect: (animeId: string | null) => void;
}

/**
 * @description Libellé compact d’une fiche pour la liste de recherche.
 */
export function formatAdkamiAnimeOptionLabel(anime: Anime): string {
  const media = formatAnimeMediaTypeLabel(anime.media_type);
  return `${resolveAnimeDisplayTitle(anime)}${
    anime.year != null ? ` (${anime.year})` : ""
  } · MAL ${anime.mal_id}${media ? ` · ${media}` : ""}${
    anime.episodes != null && anime.episodes > 0
      ? ` · ${anime.episodes} ép.`
      : ""
  }`;
}

/**
 * @description Champ de recherche + liste cliquable pour attribuer une fiche MAL.
 */
export function AdkamiAnimeSearchField({
  animes,
  selectedId,
  excludeIds,
  allowEmpty = true,
  emptyLabel = "— Aucune (pas sur MAL) —",
  disabled = false,
  onSelect,
}: AdkamiAnimeSearchFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(
    () => (selectedId ? animes.find((a) => a.id === selectedId) ?? null : null),
    [animes, selectedId],
  );
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selected ? formatAdkamiAnimeOptionLabel(selected) : "");
  }, [selected]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery(selected ? formatAdkamiAnimeOptionLabel(selected) : "");
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, selected]);

  const results = useMemo(() => {
    const needle = normalizeTitleForComparison(query);
    const pool = animes.filter(
      (anime) =>
        anime.id === selectedId || !excludeIds?.has(anime.id),
    );
    if (!needle) {
      return pool.slice(0, MAX_RESULTS);
    }
    return pool
      .filter((anime) => {
        const hay = normalizeTitleForComparison(
          [
            anime.title,
            anime.title_en,
            anime.title_ja,
            anime.title_fr,
            String(anime.mal_id),
          ]
            .filter(Boolean)
            .join(" "),
        );
        return hay.includes(needle);
      })
      .slice(0, MAX_RESULTS);
  }, [animes, excludeIds, query, selectedId]);

  const pick = (animeId: string | null) => {
    onSelect(animeId);
    setOpen(false);
  };

  return (
    <div className="adkami-anime-search" ref={rootRef}>
      <label className="form-field adkami-anime-search-field">
        <span className="sr-only">Fiche bibliothèque</span>
        <input
          type="search"
          value={query}
          disabled={disabled}
          placeholder="Rechercher une fiche MAL…"
          autoComplete="off"
          onFocus={() => {
            setOpen(true);
            if (selected) setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          aria-expanded={open}
          aria-controls="adkami-anime-search-list"
        />
      </label>
      {open && !disabled ? (
        <ul
          id="adkami-anime-search-list"
          className="adkami-anime-search-list"
          role="listbox"
        >
          {allowEmpty ? (
            <li>
              <button
                type="button"
                className={!selectedId ? "is-active" : undefined}
                onClick={() => pick(null)}
              >
                {emptyLabel}
              </button>
            </li>
          ) : null}
          {results.map((anime) => {
            const label = formatAdkamiAnimeOptionLabel(anime);
            return (
              <li key={anime.id}>
                <button
                  type="button"
                  className={anime.id === selectedId ? "is-active" : undefined}
                  title={label}
                  onClick={() => pick(anime.id)}
                >
                  {label}
                </button>
              </li>
            );
          })}
          {results.length === 0 ? (
            <li className="adkami-anime-search-empty">Aucun résultat</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
