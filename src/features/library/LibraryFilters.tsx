import { useEffect, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Search,
} from "lucide-react";
import {
  getOwnerBadgeLabel,
  getOwnerColor,
  MIHON_BADGE_LABEL,
  MIHON_COLOR,
} from "@/constants/ownerColors";
import { WORK_STATUS_OPTIONS } from "@/constants/workStatus";
import { TogglePill } from "@/components/common/TogglePill";
import type { Owner, WorkReadingStatus } from "@/types/database";
import type { LibraryFiltersState, LibrarySortKey } from "@/types/libraryFilters";
import "./LibraryFilters.css";

export interface LibraryFiltersProps {
  filters: LibraryFiltersState;
  owners: Owner[];
  demographics: string[];
  tags: string[];
  resultCount: number;
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onChange: (next: LibraryFiltersState) => void;
}

const SORT_OPTIONS: Array<{ value: LibrarySortKey; label: string }> = [
  { value: "created_desc", label: "Ajout récent" },
  { value: "created_asc", label: "Ajout ancien" },
  { value: "price_desc", label: "Prix ↓" },
  { value: "price_asc", label: "Prix ↑" },
];

const MOBILE_MEDIA = "(max-width: 767px)";

/**
 * @description Barre de recherche, tri et filtres de la bibliothèque.
 */
export function LibraryFilters({
  filters,
  owners,
  demographics,
  tags,
  resultCount,
  totalCount,
  currentPage,
  totalPages,
  pageSize,
  onChange,
}: LibraryFiltersProps) {
  const [mobileLayout, setMobileLayout] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(MOBILE_MEDIA).matches
      : false,
  );
  const [mobileExpanded, setMobileExpanded] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_MEDIA);
    const syncLayout = () => {
      setMobileLayout(media.matches);
      if (!media.matches) {
        setMobileExpanded(false);
      }
    };

    syncLayout();
    media.addEventListener("change", syncLayout);
    return () => media.removeEventListener("change", syncLayout);
  }, []);

  function toggleInList<T extends string>(list: T[], value: T): T[] {
    return list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];
  }

  function resetFilters() {
    onChange({
      ...filters,
      search: "",
      ownerIds: [],
      mihonOnly: false,
      readingStatuses: [],
      demographics: [],
      tags: [],
    });
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const hasActiveFilters =
    filters.search.trim().length > 0 ||
    filters.ownerIds.length > 0 ||
    filters.mihonOnly ||
    filters.readingStatuses.length > 0 ||
    filters.demographics.length > 0 ||
    filters.tags.length > 0;

  const collapsedOnMobile = mobileLayout && !mobileExpanded;
  const rangeStart =
    resultCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, resultCount);

  return (
    <section
      className={`library-filters${collapsedOnMobile ? " library-filters--collapsed" : ""}`}
      aria-label="Filtres bibliothèque"
    >
      <div className="library-filters-top">
        {mobileLayout ? (
          <button
            type="button"
            className="library-filters-toggle"
            onClick={() => setMobileExpanded((value) => !value)}
            aria-expanded={mobileExpanded}
            aria-label={
              mobileExpanded ? "Réduire les filtres" : "Développer les filtres"
            }
          >
            {mobileExpanded ? (
              <ChevronUp size={18} aria-hidden />
            ) : (
              <ChevronDown size={18} aria-hidden />
            )}
          </button>
        ) : null}

        <div className="library-filters-toolbar">
          <select
            className="library-sort"
            value={filters.sort}
            aria-label="Tri"
            onChange={(event) =>
              onChange({
                ...filters,
                sort: event.target.value as LibrarySortKey,
              })
            }
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label className="library-search">
            <Search size={18} aria-hidden />
            <input
              type="search"
              value={filters.search}
              placeholder="Rechercher par titre…"
              onChange={(event) =>
                onChange({ ...filters, search: event.target.value })
              }
            />
          </label>
        </div>

        <div className="library-filters-actions">
          {hasActiveFilters ? (
            <button
              type="button"
              className="library-filters-reset-btn"
              onClick={resetFilters}
              title="Réinitialiser les filtres"
              aria-label="Réinitialiser les filtres"
            >
              <RotateCcw size={18} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            className="library-filters-scroll-top"
            onClick={scrollToTop}
            title="Retour en haut"
            aria-label="Retour en haut"
          >
            <ArrowUp size={18} aria-hidden />
          </button>
        </div>
      </div>

      <div className="library-filters-body">
        <div className="library-filters-owners">
          <span className="library-filters-label">Propriétaire</span>
          <div className="library-filters-pills">
            {owners.map((owner) => (
              <TogglePill
                key={owner.id}
                label={getOwnerBadgeLabel(owner.name)}
                color={getOwnerColor(owner.name)}
                showColorWhenIdle
                active={filters.ownerIds.includes(owner.id)}
                onClick={() =>
                  onChange({
                    ...filters,
                    ownerIds: toggleInList(filters.ownerIds, owner.id),
                  })
                }
              />
            ))}
            <TogglePill
              label={MIHON_BADGE_LABEL}
              color={MIHON_COLOR}
              showColorWhenIdle
              active={filters.mihonOnly}
              onClick={() =>
                onChange({ ...filters, mihonOnly: !filters.mihonOnly })
              }
            />
          </div>
          <span className="library-filters-label library-filters-label--status">
            Statut
          </span>
          <div className="library-filters-pills">
            {WORK_STATUS_OPTIONS.map((option) => (
              <TogglePill
                key={option.value}
                label={option.label}
                color={option.color}
                showColorWhenIdle
                active={filters.readingStatuses.includes(option.value)}
                onClick={() =>
                  onChange({
                    ...filters,
                    readingStatuses: toggleInList<WorkReadingStatus>(
                      filters.readingStatuses,
                      option.value,
                    ),
                  })
                }
              />
            ))}
          </div>
        </div>

        {(demographics.length > 0 || tags.length > 0) && (
          <div className="library-filters-meta">
            {demographics.length > 0 ? (
              <div className="library-filters-row">
                <span className="library-filters-label">Démographie</span>
                <div className="library-filters-pills">
                  {demographics.map((demo) => (
                    <TogglePill
                      key={demo}
                      label={demo}
                      active={filters.demographics.includes(demo)}
                      onClick={() =>
                        onChange({
                          ...filters,
                          demographics: toggleInList(
                            filters.demographics,
                            demo,
                          ),
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {tags.length > 0 ? (
              <div className="library-filters-row">
                <span className="library-filters-label">Genres & thèmes</span>
                <div className="library-filters-pills library-filters-pills--wrap">
                  {tags.map((tag) => (
                    <TogglePill
                      key={tag}
                      label={tag}
                      active={filters.tags.includes(tag)}
                      onClick={() =>
                        onChange({
                          ...filters,
                          tags: toggleInList(filters.tags, tag),
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <p className="library-filters-count">
        {resultCount === 0 ? (
          <>0 / {totalCount} œuvre{totalCount > 1 ? "s" : ""}</>
        ) : totalPages > 1 ? (
          <>
            {rangeStart}–{rangeEnd} sur {resultCount} · page {currentPage}/
            {totalPages}
          </>
        ) : (
          <>
            {resultCount} / {totalCount} œuvre{totalCount > 1 ? "s" : ""}
          </>
        )}
      </p>
    </section>
  );
}
