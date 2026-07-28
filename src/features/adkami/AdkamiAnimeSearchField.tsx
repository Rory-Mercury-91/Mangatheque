import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatAnimeMediaTypeLabel } from "@/constants/animeStatus";
import { resolveAnimeDisplayTitle, type Anime } from "@/types/anime";
import { normalizeTitleForComparison } from "@/utils/textNormalize";
import "./AdkamiAnimeSearchField.css";

const MAX_RESULTS = 12;
const LIST_MAX_HEIGHT = 224; // ~14rem
/** Largeur cible pour lire les titres complets (indépendante de la colonne). */
const LIST_PREFERRED_WIDTH = 640;
const VIEWPORT_GAP = 8;

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

interface ListPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: "below" | "above";
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
 * @description Calcule la position fixed de la liste (sous ou au-dessus du champ).
 * Largeur élargie pour lire les titres entiers, calée dans le viewport.
 */
function computeListPosition(anchor: DOMRect): ListPosition {
  const spaceBelow = window.innerHeight - anchor.bottom - VIEWPORT_GAP;
  const spaceAbove = anchor.top - VIEWPORT_GAP;
  const placeAbove =
    spaceBelow < Math.min(LIST_MAX_HEIGHT, 160) && spaceAbove > spaceBelow;
  const maxHeight = Math.max(
    120,
    Math.min(LIST_MAX_HEIGHT, placeAbove ? spaceAbove : spaceBelow),
  );
  const maxViewportWidth = Math.max(
    anchor.width,
    window.innerWidth - VIEWPORT_GAP * 2,
  );
  const width = Math.min(
    Math.max(anchor.width, LIST_PREFERRED_WIDTH),
    maxViewportWidth,
  );
  let left = anchor.left;
  if (left + width > window.innerWidth - VIEWPORT_GAP) {
    left = Math.max(VIEWPORT_GAP, window.innerWidth - VIEWPORT_GAP - width);
  }

  if (placeAbove) {
    return {
      top: Math.max(VIEWPORT_GAP, anchor.top - maxHeight - 4),
      left,
      width,
      maxHeight,
      placement: "above",
    };
  }
  return {
    top: anchor.bottom + 4,
    left,
    width,
    maxHeight,
    placement: "below",
  };
}

/**
 * @description Champ de recherche + liste cliquable pour attribuer une fiche MAL.
 * La liste est rendue en portal (fixed) pour sortir des containers overflow.
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
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = useMemo(
    () => (selectedId ? animes.find((a) => a.id === selectedId) ?? null : null),
    [animes, selectedId],
  );
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<ListPosition | null>(null);

  useEffect(() => {
    setQuery(selected ? formatAdkamiAnimeOptionLabel(selected) : "");
  }, [selected]);

  useLayoutEffect(() => {
    if (!open || disabled) {
      setPosition(null);
      return;
    }
    const update = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition(computeListPosition(rect));
    };
    update();
    window.addEventListener("resize", update);
    // Capture : scroll de la modale / page
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, disabled, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
      setQuery(selected ? formatAdkamiAnimeOptionLabel(selected) : "");
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

  const list =
    open && !disabled && position
      ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            className={`adkami-anime-search-list adkami-anime-search-list--portal adkami-anime-search-list--${position.placement}`}
            role="listbox"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
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
                    className={
                      anime.id === selectedId ? "is-active" : undefined
                    }
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
          </ul>,
          document.body,
        )
      : null;

  return (
    <div className="adkami-anime-search" ref={rootRef}>
      <label className="form-field adkami-anime-search-field">
        <span className="sr-only">Fiche bibliothèque</span>
        <input
          ref={inputRef}
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
          aria-controls={listId}
        />
      </label>
      {list}
    </div>
  );
}
