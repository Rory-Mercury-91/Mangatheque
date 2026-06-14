import { useEffect, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Pin,
  RotateCcw,
  Search,
} from "lucide-react";
import { WORK_STATUS_OPTIONS } from "@/constants/workStatus";
import {
  USER_READING_STATUS_OPTIONS,
  type UserReadingStatus,
} from "@/constants/userReadingStatus";
import { TogglePill } from "@/components/common/TogglePill";
import {
  getOwnerBadgeLabel,
  getOwnerColor,
  MIHON_BADGE_LABEL,
  MIHON_COLOR,
} from "@/constants/ownerColors";
import type { Owner, WorkReadingStatus } from "@/types/database";
import {
  cycleLibraryMihonFilter,
  getLibraryMihonFilterLabel,
  getLibrarySortLabel,
  LIBRARY_SORT_OPTIONS,
  type LibraryFiltersState,
  type LibrarySortKey,
} from "@/types/libraryFilters";
import { scrollAppMainToTop } from "@/utils/scrollAppMain";
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
  defaultSort?: LibrarySortKey | null;
  savingDefaultSort?: boolean;
  sortSaveMessage?: string | null;
  onChange: (next: LibraryFiltersState) => void;
  onReset?: () => void;
  onSaveDefaultSort?: (sort: LibrarySortKey) => void | Promise<void>;
}

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
  defaultSort = null,
  savingDefaultSort = false,
  sortSaveMessage = null,
  onChange,
  onReset,
  onSaveDefaultSort,
}: LibraryFiltersProps) {
  const [mobileLayout, setMobileLayout] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(MOBILE_MEDIA).matches
      : false,
  );
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [metaExpanded, setMetaExpanded] = useState(false);

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
    onReset?.();
    onChange({
      ...filters,
      search: "",
      ownerIds: [],
      mihonFilter: "all",
      readingStatuses: [],
      userReadingStatuses: [],
      demographics: [],
      tags: [],
    });
  }

  const hasActiveFilters =
    filters.search.trim().length > 0 ||
    filters.ownerIds.length > 0 ||
    filters.mihonFilter !== "all" ||
    filters.readingStatuses.length > 0 ||
    filters.userReadingStatuses.length > 0 ||
    filters.demographics.length > 0 ||
    filters.tags.length > 0;

  const hasActiveSecondaryFilters =
    filters.readingStatuses.length > 0 ||
    filters.userReadingStatuses.length > 0 ||
    filters.demographics.length > 0 ||
    filters.tags.length > 0;
  const collapsedOnMobile = mobileLayout && !mobileExpanded;
  const collapsedOnDesktop = !mobileLayout && !metaExpanded;
  const rangeStart =
    resultCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, resultCount);
  const isCurrentDefault = defaultSort !== null && filters.sort === defaultSort;
  const defaultSortTitle = isCurrentDefault
    ? `Tri par défaut : ${getLibrarySortLabel(filters.sort)}`
    : "Enregistrer ce tri comme défaut pour votre compte";

  const sortSelect = (
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
      {LIBRARY_SORT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );

  const sortDefaultButton =
    onSaveDefaultSort ? (
      <button
        type="button"
        className={`library-sort-default${isCurrentDefault ? " library-sort-default--active" : ""}`}
        onClick={() => void onSaveDefaultSort(filters.sort)}
        disabled={savingDefaultSort}
        title={defaultSortTitle}
        aria-label={defaultSortTitle}
        aria-pressed={isCurrentDefault}
      >
        <Pin size={16} aria-hidden />
      </button>
    ) : null;

  const ownerFilters = (
    <div className="library-filters-owners">
      <span className="library-filters-label">Propriétaire</span>
      <div className="library-filters-pills">
        {owners.map((owner) => (
          <TogglePill
            key={owner.id}
            label={getOwnerBadgeLabel(owner.name)}
            color={getOwnerColor(owner.name)}
            showColorWhenIdle
            visualVariant="outline"
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
          visualVariant="outline"
          active={filters.mihonFilter !== "all"}
          activeVariant={
            filters.mihonFilter === "exclude" ? "exclude" : "include"
          }
          title={getLibraryMihonFilterLabel(filters.mihonFilter)}
          onClick={() =>
            onChange({
              ...filters,
              mihonFilter: cycleLibraryMihonFilter(filters.mihonFilter),
            })
          }
        />
      </div>
    </div>
  );

  const filterGroups = (
    <>
      <div className="library-filters-group library-filters-group--reading">
        <span className="library-filters-label">Ma lecture</span>
        <div className="library-filters-pills">
          {USER_READING_STATUS_OPTIONS.map((option) => (
            <TogglePill
              key={option.value}
              label={option.label}
              color={option.color}
              showColorWhenIdle
              visualVariant="soft"
              active={filters.userReadingStatuses.includes(option.value)}
              onClick={() =>
                onChange({
                  ...filters,
                  userReadingStatuses: toggleInList<UserReadingStatus>(
                    filters.userReadingStatuses,
                    option.value,
                  ),
                })
              }
            />
          ))}
        </div>
      </div>

      <div className="library-filters-group library-filters-group--statut">
        <span className="library-filters-label">Statut VF</span>
        <div className="library-filters-pills">
          {WORK_STATUS_OPTIONS.map((option) => (
            <TogglePill
              key={option.value}
              label={option.label}
              color={option.color}
              showColorWhenIdle
              visualVariant="dash"
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

      {demographics.length > 0 ? (
        <div className="library-filters-group library-filters-group--demo">
          <span className="library-filters-label">Démographie</span>
          <div className="library-filters-pills library-filters-pills--single-line">
            {demographics.map((demo) => (
              <TogglePill
                key={demo}
                label={demo}
                active={filters.demographics.includes(demo)}
                onClick={() =>
                  onChange({
                    ...filters,
                    demographics: toggleInList(filters.demographics, demo),
                  })
                }
              />
            ))}
          </div>
        </div>
      ) : null}

      {tags.length > 0 ? (
        <div className="library-filters-group library-filters-group--tags">
          <span className="library-filters-label">Genres &amp; thèmes</span>
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
    </>
  );

  const metaToggleTitle = metaExpanded
    ? "Masquer ma lecture, statut VF, démographie et genres"
    : "Afficher ma lecture, statut VF, démographie et genres";

  const resultCountNode = (
    <p className="library-filters-count" aria-live="polite">
      {resultCount === 0 ? (
        <>0 / {totalCount} série{totalCount > 1 ? "s" : ""}</>
      ) : totalPages > 1 ? (
        <>
          {rangeStart}–{rangeEnd} sur {resultCount} · page {currentPage}/
          {totalPages}
        </>
      ) : (
        <>
          {resultCount} / {totalCount} série{totalCount > 1 ? "s" : ""}
        </>
      )}
    </p>
  );

  return (
    <section className="library-filters" aria-label="Filtres bibliothèque">
      {/* Mobile — toujours visible : recherche + propriétaire */}
      <div className="library-filters-mobile-pinned">
        {ownerFilters}
        {resultCountNode}
        <div className="library-filters-search-row">
          <button
            type="button"
            className={`library-filters-toggle${hasActiveSecondaryFilters && collapsedOnMobile ? " library-filters-toggle--active" : ""}`}
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
        </div>
      </div>

      {/* Desktop — barre unique */}
      <div className="library-filters-bar library-filters-bar--desktop">
        <button
          type="button"
          className={`library-filters-meta-toggle${metaExpanded ? " library-filters-meta-toggle--expanded" : ""}${hasActiveSecondaryFilters ? " library-filters-meta-toggle--active" : ""}`}
          onClick={() => setMetaExpanded((value) => !value)}
          aria-expanded={metaExpanded}
          title={metaToggleTitle}
          aria-label={metaToggleTitle}
        >
          {metaExpanded ? (
            <ChevronUp size={18} aria-hidden />
          ) : (
            <ChevronDown size={18} aria-hidden />
          )}
          {hasActiveSecondaryFilters && !metaExpanded ? (
            <span className="library-filters-meta-badge" aria-hidden>
              •
            </span>
          ) : null}
        </button>
        <div className="library-sort-row">
          {sortSelect}
          {sortDefaultButton}
        </div>
        {ownerFilters}
        {resultCountNode}
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
            onClick={() => scrollAppMainToTop()}
            title="Retour en haut"
            aria-label="Retour en haut"
          >
            <ArrowUp size={18} aria-hidden />
          </button>
        </div>
      </div>

      {sortSaveMessage ? (
        <p className="library-sort-save-hint" role="status">
          {sortSaveMessage}
        </p>
      ) : null}

      {/* Mobile — zone repliable : tri / épingle + filtres */}
      {!collapsedOnMobile ? (
        <div className="library-filters-mobile-drawer">
          <div className="library-filters-mobile-controls">
            <div className="library-sort-row">
              {sortSelect}
              {sortDefaultButton}
            </div>
          </div>
          <div className="library-filters-secondary library-filters-secondary--mobile">
            {filterGroups}
          </div>
        </div>
      ) : null}

      <div
        className={`library-filters-secondary library-filters-secondary--desktop${collapsedOnDesktop ? " library-filters-secondary--collapsed-desktop" : ""}`}
      >
        {filterGroups}
      </div>
    </section>
  );
}
