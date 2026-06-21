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
  cycleLibraryOwnerFilter,
  getLibraryMihonFilterLabel,
  getLibraryOwnerFilterLabel,
  getLibrarySortLabel,
  hasActiveOwnerFilters,
  LIBRARY_SORT_OPTIONS,
  type LibraryFiltersState,
  type LibrarySortKey,
} from "@/types/libraryFilters";
import { useAppMainScrollLock } from "@/hooks/useAppMainScrollLock";
import { useDebouncedSearchCommit } from "@/hooks/useDebouncedSearchCommit";
import { scrollAppMainToTop } from "@/utils/scrollAppMain";
import { LibraryFiltersHelpModal } from "@/features/library/LibraryFiltersHelpModal";
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
  /** Propagation différée du texte de recherche (saisie locale immédiate). */
  onSearchCommit: (search: string) => void;
  onReset?: () => void;
  onSaveDefaultSort?: (sort: LibrarySortKey) => void | Promise<void>;
  /** Désactive les filtres propriétaire tant que les métadonnées ne sont pas prêtes. */
  ownerFiltersDisabled?: boolean;
  /** Masque le compteur de résultats tant que les métadonnées ne sont pas prêtes. */
  showResultCount?: boolean;
}

const COMPACT_FILTERS_MEDIA = "(max-width: 1023px)";

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
  onSearchCommit,
  onReset,
  onSaveDefaultSort,
  ownerFiltersDisabled = false,
  showResultCount = true,
}: LibraryFiltersProps) {
  const [compactLayout, setCompactLayout] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(COMPACT_FILTERS_MEDIA).matches
      : false,
  );
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [metaExpanded, setMetaExpanded] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const [searchDraft, setSearchDraft] = useDebouncedSearchCommit(
    filters.search,
    onSearchCommit,
  );

  useEffect(() => {
    const media = window.matchMedia(COMPACT_FILTERS_MEDIA);
    const syncLayout = () => {
      setCompactLayout(media.matches);
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

  function cycleOwnerFilter(ownerId: string) {
    const currentMode = filters.ownerFilterById[ownerId];
    const nextMode = cycleLibraryOwnerFilter(currentMode);
    const nextOwnerFilterById = { ...filters.ownerFilterById };

    if (nextMode) {
      nextOwnerFilterById[ownerId] = nextMode;
    } else {
      delete nextOwnerFilterById[ownerId];
    }

    onChange({
      ...filters,
      ownerFilterById: nextOwnerFilterById,
    });
  }

  function resetFilters() {
    onReset?.();
    onChange({
      ...filters,
      search: "",
      ownerFilterById: {},
      mihonFilter: "all",
      readingStatuses: [],
      userReadingStatuses: [],
      demographics: [],
      tags: [],
      favoriteOwnerIds: [],
    });
  }

  const hasActiveFilters =
    searchDraft.trim().length > 0 ||
    hasActiveOwnerFilters(filters.ownerFilterById) ||
    filters.mihonFilter !== "all" ||
    filters.readingStatuses.length > 0 ||
    filters.userReadingStatuses.length > 0 ||
    filters.demographics.length > 0 ||
    filters.tags.length > 0 ||
    filters.favoriteOwnerIds.length > 0;

  const hasActiveHiddenFilters =
    hasActiveOwnerFilters(filters.ownerFilterById) ||
    filters.mihonFilter !== "all" ||
    filters.readingStatuses.length > 0 ||
    filters.userReadingStatuses.length > 0 ||
    filters.demographics.length > 0 ||
    filters.tags.length > 0 ||
    filters.favoriteOwnerIds.length > 0;

  const hasActiveSecondaryFilters =
    filters.readingStatuses.length > 0 ||
    filters.userReadingStatuses.length > 0 ||
    filters.demographics.length > 0 ||
    filters.tags.length > 0 ||
    filters.favoriteOwnerIds.length > 0;

  const collapsedOnMobile = compactLayout && !mobileExpanded;
  const collapsedOnDesktop = !compactLayout && !metaExpanded;

  useAppMainScrollLock(compactLayout && mobileExpanded);

  const mobileFiltersToggleTitle = mobileExpanded
    ? "Masquer les filtres"
    : "Afficher les filtres";

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
        {owners.map((owner) => {
          const ownerLabel = getOwnerBadgeLabel(owner.name);
          const ownerMode = filters.ownerFilterById[owner.id];

          return (
            <TogglePill
              key={owner.id}
              label={ownerLabel}
              color={getOwnerColor(owner.name)}
              showColorWhenIdle
              visualVariant="outline"
              active={ownerMode != null}
              activeVariant={ownerMode === "exclusive" ? "exclusive" : "include"}
              disabled={ownerFiltersDisabled}
              title={getLibraryOwnerFilterLabel(ownerLabel, ownerMode)}
              onClick={() => cycleOwnerFilter(owner.id)}
            />
          );
        })}
        <TogglePill
          label={MIHON_BADGE_LABEL}
          color={MIHON_COLOR}
          showColorWhenIdle
          visualVariant="outline"
          active={filters.mihonFilter !== "all"}
          disabled={ownerFiltersDisabled}
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

  const favoriteFilters = (
    <div className="library-filters-owners">
      <span className="library-filters-label">Favoris</span>
      <div className="library-filters-pills">
        {owners.map((owner) => (
          <TogglePill
            key={`favorite-${owner.id}`}
            label={`★ ${getOwnerBadgeLabel(owner.name)}`}
            color={getOwnerColor(owner.name)}
            showColorWhenIdle
            visualVariant="outline"
            active={filters.favoriteOwnerIds.includes(owner.id)}
            onClick={() =>
              onChange({
                ...filters,
                favoriteOwnerIds: toggleInList(filters.favoriteOwnerIds, owner.id),
              })
            }
          />
        ))}
      </div>
    </div>
  );

  const filterGroups = (
    <>
      <div className="library-filters-inline-row library-filters-reading-row app-scroll-themed app-scroll-themed-x">
        <div className="library-filters-group library-filters-group--reading">
          <span className="library-filters-label">Ma lecture</span>
          <div className="library-filters-pills">
            {USER_READING_STATUS_OPTIONS.map((option) => (
              <TogglePill
                key={option.value}
                label={option.label}
                color={option.color}
                showColorWhenIdle
                visualVariant="outline"
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
          <span className="library-filters-label">Statut</span>
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
      </div>

      {demographics.length > 0 ? (
        <div className="library-filters-group library-filters-group--demo">
          <span className="library-filters-label">Démographie</span>
          <div className="library-filters-pills library-filters-pills--single-line app-scroll-themed app-scroll-themed-x">
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
          <div className="library-filters-pills library-filters-pills--wrap app-scroll-themed app-scroll-themed-y">
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
    ? "Masquer ma lecture, statut, démographie et genres"
    : "Afficher ma lecture, statut, démographie et genres";

  const filtersHelpButton = (
    <button
      type="button"
      className="library-filters-help-btn"
      onClick={() => setHelpOpen(true)}
      title="Aide sur les filtres"
      aria-label="Aide sur les filtres"
    >
      ?
    </button>
  );

  const resultCountNode = showResultCount ? (
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
  ) : null;

  return (
    <section
      className={[
        "library-filters",
        !collapsedOnMobile
          ? "library-filters--mobile-expanded app-scroll-lock-allow"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Filtres bibliothèque"
    >
      {/* Mobile — recherche seule ; tout le reste dans le tiroir */}
      <div className="library-filters-mobile-pinned">
        <div className="library-filters-search-row">
          <button
            type="button"
            className={`library-filters-toggle library-filters-toggle--mobile${mobileExpanded ? " library-filters-toggle--expanded" : ""}${hasActiveHiddenFilters && collapsedOnMobile ? " library-filters-toggle--active" : ""}`}
            onClick={() => setMobileExpanded((value) => !value)}
            aria-expanded={mobileExpanded}
            title={mobileFiltersToggleTitle}
            aria-label={mobileFiltersToggleTitle}
          >
            {mobileExpanded ? (
              <ChevronUp size={18} aria-hidden />
            ) : (
              <ChevronDown size={18} aria-hidden />
            )}
            {hasActiveHiddenFilters && collapsedOnMobile ? (
              <span className="library-filters-meta-badge" aria-hidden>
                •
              </span>
            ) : null}
          </button>
          <label className="library-search">
            <Search size={18} aria-hidden />
            <input
              type="search"
              value={searchDraft}
              placeholder="Rechercher par titre…"
              onChange={(event) => setSearchDraft(event.target.value)}
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
          {filtersHelpButton}
        </div>
        {resultCountNode}
      </div>

      {/* Desktop — barre sur deux lignes */}
      <div className="library-filters-bar library-filters-bar--desktop">
        <div className="library-filters-bar-main">
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
          <label className="library-search">
            <Search size={18} aria-hidden />
            <input
              type="search"
              value={searchDraft}
              placeholder="Rechercher par titre…"
              onChange={(event) => setSearchDraft(event.target.value)}
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
            {filtersHelpButton}
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
        <div className="library-filters-bar-ownership library-filters-inline-row app-scroll-themed app-scroll-themed-x">
          {ownerFilters}
          {favoriteFilters}
          {resultCountNode}
        </div>
      </div>

      {sortSaveMessage ? (
        <p className="library-sort-save-hint" role="status">
          {sortSaveMessage}
        </p>
      ) : null}

      {!collapsedOnMobile ? (
        <div className="library-filters-mobile-drawer">
          <div className="library-filters-mobile-controls">
            <div className="library-sort-row">
              {sortSelect}
              {sortDefaultButton}
            </div>
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
          <div className="library-filters-bar-ownership library-filters-mobile-ownership">
            {ownerFilters}
            {favoriteFilters}
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

      <LibraryFiltersHelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
      />
    </section>
  );
}
