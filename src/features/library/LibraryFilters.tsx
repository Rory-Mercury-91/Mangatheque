import { useState } from "react";
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
import { isMobileRuntime } from "@/lib/platform";
import { useTouchTabletLayout } from "@/hooks/useTouchTabletLayout";
import { LibraryFiltersHelpModal } from "@/features/library/LibraryFiltersHelpModal";
import { LibraryFilterGroupLabel } from "@/features/library/LibraryFilterGroupLabel";
import {
  getLibraryMetaFilterGroup,
  LIBRARY_META_FILTER_GROUPS,
} from "@/features/library/libraryMetaFilterGroups";
import {
  getLibraryPrimaryFilterGroup,
  LIBRARY_PRIMARY_FILTER_GROUPS,
} from "@/features/library/libraryPrimaryFilterGroups";
import {
  LibraryFiltersTouch,
  type TouchMetaFilterTab,
  type TouchPrimaryFilterTab,
} from "@/features/library/LibraryFiltersTouch";
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
  const touchFiltersLayout = isMobileRuntime();
  const touchTabletLayout = useTouchTabletLayout(touchFiltersLayout);
  const touchPhoneLayout = touchFiltersLayout && !touchTabletLayout;
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [metaExpanded, setMetaExpanded] = useState(false);
  const [touchPrimaryTab, setTouchPrimaryTab] =
    useState<TouchPrimaryFilterTab | null>(null);
  const [touchMetaTab, setTouchMetaTab] = useState<TouchMetaFilterTab | null>(
    null,
  );
  const [helpOpen, setHelpOpen] = useState(false);

  const [searchDraft, setSearchDraft] = useDebouncedSearchCommit(
    filters.search,
    onSearchCommit,
  );

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

  const collapsedOnMobile = touchFiltersLayout && !mobileExpanded;
  const collapsedOnDesktop = !touchFiltersLayout && !metaExpanded;

  useAppMainScrollLock(touchFiltersLayout && mobileExpanded);

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

  const comptePills = (
    <div className="library-filters-pills library-filters-cell library-filters-cell--compte-pills">
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
  );

  const favoritePills = (
    <div className="library-filters-pills library-filters-cell library-filters-cell--favoris-pills">
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
  );

  const readingPills = (
    <div className="library-filters-pills library-filters-cell library-filters-cell--reading-pills">
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
  );

  const statutPills = (
    <div className="library-filters-pills library-filters-cell library-filters-cell--statut-pills">
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
  );

  const profilGroup = getLibraryPrimaryFilterGroup("compte");
  const favorisGroup = getLibraryPrimaryFilterGroup("favoris");
  const statutGroup = getLibraryPrimaryFilterGroup("statut");
  const lectureGroup = getLibraryPrimaryFilterGroup("reading");
  const demoGroup = getLibraryMetaFilterGroup("demo");
  const genresGroup = getLibraryMetaFilterGroup("tags");

  const ownerFilters = (
    <>
      <LibraryFilterGroupLabel
        icon={profilGroup.icon}
        label={profilGroup.label}
        className="library-filters-cell library-filters-cell--compte-label"
      />
      {comptePills}
    </>
  );

  const favoriteFilters = (
    <>
      <LibraryFilterGroupLabel
        icon={favorisGroup.icon}
        label={favorisGroup.label}
        className="library-filters-cell library-filters-cell--favoris-label"
      />
      {favoritePills}
    </>
  );

  const showSecondaryColoredFilters = !touchFiltersLayout && !collapsedOnDesktop;

  const demoPills = (
    <div className="library-filters-pills library-filters-pills--wrap library-filters-cell library-filters-cell--demo-pills app-scroll-themed app-scroll-themed-y">
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
  );

  const tagsPills = (
    <div className="library-filters-pills library-filters-pills--wrap library-filters-cell library-filters-cell--tags-pills app-scroll-themed app-scroll-themed-y">
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
  );

  const desktopColoredFiltersGrid = (
    <div className="library-filters-colored-grid">
      {ownerFilters}
      {favoriteFilters}
      {showSecondaryColoredFilters ? (
        <>
          <LibraryFilterGroupLabel
            icon={lectureGroup.icon}
            label={lectureGroup.label}
            className="library-filters-cell library-filters-cell--reading-label"
          />
          {readingPills}
          <LibraryFilterGroupLabel
            icon={statutGroup.icon}
            label={statutGroup.label}
            className="library-filters-cell library-filters-cell--statut-label"
          />
          {statutPills}
          {demographics.length > 0 ? (
            <>
              <LibraryFilterGroupLabel
                icon={demoGroup.icon}
                label={demoGroup.label}
                className="library-filters-cell library-filters-cell--demo-label"
              />
              {demoPills}
            </>
          ) : null}
          {tags.length > 0 ? (
            <>
              <LibraryFilterGroupLabel
                icon={genresGroup.icon}
                label={genresGroup.label}
                className="library-filters-cell library-filters-cell--tags-label"
              />
              {tagsPills}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );

  const touchPrimaryAccordionTabs = LIBRARY_PRIMARY_FILTER_GROUPS.map((group) => {
    const panelById = {
      compte: comptePills,
      favoris: favoritePills,
      statut: statutPills,
      reading: readingPills,
    } as const;

    const activeById = {
      compte:
        hasActiveOwnerFilters(filters.ownerFilterById) ||
        filters.mihonFilter !== "all",
      favoris: filters.favoriteOwnerIds.length > 0,
      statut: filters.readingStatuses.length > 0,
      reading: filters.userReadingStatuses.length > 0,
    } as const;

    return {
      id: group.id,
      label: group.label,
      icon: group.icon,
      hasActiveFilters: activeById[group.id],
      panel: panelById[group.id],
    };
  });

  const touchMetaAccordionTabs = LIBRARY_META_FILTER_GROUPS.flatMap((group) => {
    if (group.id === "demo" && demographics.length === 0) {
      return [];
    }
    if (group.id === "tags" && tags.length === 0) {
      return [];
    }

    const panelById = {
      demo: demoPills,
      tags: tagsPills,
    } as const;

    const activeById = {
      demo: filters.demographics.length > 0,
      tags: filters.tags.length > 0,
    } as const;

    return [
      {
        id: group.id,
        label: group.label,
        icon: group.icon,
        hasActiveFilters: activeById[group.id],
        panel: panelById[group.id],
        panelClassName: "library-filters-accordion-panel--meta",
      },
    ];
  });

  const touchDrawerFilters = touchFiltersLayout ? (
    <LibraryFiltersTouch
      primaryTabs={touchPrimaryAccordionTabs}
      metaTabs={touchMetaAccordionTabs}
      primaryTab={touchPrimaryTab}
      metaTab={touchMetaTab}
      onPrimaryTabChange={setTouchPrimaryTab}
      onMetaTabChange={setTouchMetaTab}
      variant={touchPhoneLayout ? "phone" : "tablet"}
    />
  ) : null;

  const metaToggleTitle = metaExpanded
    ? "Masquer lecture, statut, démographie et genres"
    : "Afficher lecture, statut, démographie et genres";

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

  const sortRowNode = (
    <div className="library-sort-row">
      {sortSelect}
      {sortDefaultButton}
    </div>
  );

  const searchFieldNode = (
    <label className="library-search">
      <Search size={18} aria-hidden />
      <input
        type="search"
        value={searchDraft}
        placeholder="Rechercher par titre…"
        onChange={(event) => setSearchDraft(event.target.value)}
      />
    </label>
  );

  const scrollTopButton = (
    <button
      type="button"
      className="library-filters-scroll-top"
      onClick={() => scrollAppMainToTop()}
      title="Retour en haut"
      aria-label="Retour en haut"
    >
      <ArrowUp size={18} aria-hidden />
    </button>
  );

  const filterActionsNode = (
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
      {scrollTopButton}
    </div>
  );

  const touchPinnedActionsNode = (
    <>
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
    </>
  );

  const mobileFiltersToggleButton = (
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
  );

  const desktopMetaToggleButton = (
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
        touchFiltersLayout ? "library-filters--touch" : "",
        touchTabletLayout
          ? "library-filters--touch-tablet"
          : touchFiltersLayout
            ? "library-filters--touch-phone"
            : "",
        !collapsedOnMobile
          ? "library-filters--mobile-expanded app-scroll-lock-allow"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Filtres bibliothèque"
    >
      {/* Mobile / tablette — barre épinglée + tiroir filtres */}
      <div className="library-filters-mobile-pinned">
        <div
          className={[
            "library-filters-search-row",
            touchTabletLayout ? "library-filters-search-row--tablet" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {mobileFiltersToggleButton}
          {touchTabletLayout ? sortRowNode : null}
          {searchFieldNode}
          {touchPinnedActionsNode}
        </div>
        {resultCountNode}
      </div>

      {/* Desktop — barre principale + grille filtres */}
      <div className="library-filters-bar library-filters-bar--desktop">
        <div className="library-filters-bar-main">
          {desktopMetaToggleButton}
          {sortRowNode}
          {searchFieldNode}
          {filterActionsNode}
        </div>
        <div className="library-filters-bar-count">{resultCountNode}</div>
        <div className="library-filters-bar-body">{desktopColoredFiltersGrid}</div>
      </div>

      {sortSaveMessage ? (
        <p className="library-sort-save-hint" role="status">
          {sortSaveMessage}
        </p>
      ) : null}

      {!collapsedOnMobile ? (
        <div className="library-filters-mobile-drawer">
          {touchPhoneLayout ? (
            <div className="library-filters-mobile-controls">{sortRowNode}</div>
          ) : null}
          {touchDrawerFilters}
        </div>
      ) : null}

      <LibraryFiltersHelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
      />
    </section>
  );
}
