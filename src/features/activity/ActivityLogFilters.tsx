import { useEffect, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Search,
} from "lucide-react";
import { TogglePill } from "@/components/common/TogglePill";
import type {
  ActivityLogActor,
  ActivityLogFilterAction,
  ActivityLogFiltersState,
} from "@/types/activityLog";
import "./ActivityLogFilters.css";

export interface ActivityLogFiltersProps {
  filters: ActivityLogFiltersState;
  actors: ActivityLogActor[];
  resultCount: number;
  currentPage: number;
  totalPages: number;
  onChange: (next: ActivityLogFiltersState) => void;
}

const ACTION_FILTERS: Array<{
  value: ActivityLogFilterAction;
  label: string;
}> = [
  { value: "series_create", label: "Création série" },
  { value: "volume_create", label: "Création tome" },
  { value: "series_delete", label: "Suppression série" },
  { value: "volume_delete", label: "Suppression tome" },
  { value: "planning_update", label: "Maj Nautiljon" },
];

const MOBILE_MEDIA = "(max-width: 767px)";

/**
 * @description Barre de recherche fixe et filtres du journal (repliables sur mobile).
 */
export function ActivityLogFilters({
  filters,
  actors,
  resultCount,
  currentPage,
  totalPages,
  onChange,
}: ActivityLogFiltersProps) {
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
      search: "",
      actionTypes: [],
      userIds: [],
    });
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const hasActiveFilters =
    filters.search.trim().length > 0 ||
    filters.actionTypes.length > 0 ||
    filters.userIds.length > 0;

  const collapsedOnMobile = mobileLayout && !mobileExpanded;

  return (
    <section
      className={`activity-log-filters${collapsedOnMobile ? " activity-log-filters--collapsed" : ""}`}
      aria-label="Filtres journal"
    >
      <div className="activity-log-filters-top">
        {mobileLayout ? (
          <button
            type="button"
            className="activity-log-filters-toggle"
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

        <label className="activity-log-search">
          <Search size={18} aria-hidden />
          <input
            type="search"
            value={filters.search}
            placeholder="Rechercher une série…"
            onChange={(event) =>
              onChange({ ...filters, search: event.target.value })
            }
          />
        </label>

        <div className="activity-log-filters-actions">
          {hasActiveFilters ? (
            <button
              type="button"
              className="activity-log-filters-reset"
              onClick={resetFilters}
              title="Réinitialiser les filtres"
              aria-label="Réinitialiser les filtres"
            >
              <RotateCcw size={18} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            className="activity-log-scroll-top"
            onClick={scrollToTop}
            title="Retour en haut"
            aria-label="Retour en haut"
          >
            <ArrowUp size={18} aria-hidden />
          </button>
        </div>
      </div>

      <div className="activity-log-filters-body">
        <div className="activity-log-filters-row">
          <span className="activity-log-filters-label">Type</span>
          <div className="activity-log-filters-pills">
            {ACTION_FILTERS.map((option) => (
              <TogglePill
                key={option.value}
                label={option.label}
                active={filters.actionTypes.includes(option.value)}
                onClick={() =>
                  onChange({
                    ...filters,
                    actionTypes: toggleInList(
                      filters.actionTypes,
                      option.value,
                    ),
                  })
                }
              />
            ))}
          </div>
        </div>

        <div className="activity-log-filters-row">
          <span className="activity-log-filters-label">Auteur</span>
          <div className="activity-log-filters-pills">
            {actors.length === 0 ? (
              <span className="activity-log-filters-hint">
                Aucun compte inscrit pour l&apos;instant.
              </span>
            ) : (
              actors.map((actor) => (
                <TogglePill
                  key={actor.userId}
                  label={actor.userEmail}
                  active={filters.userIds.includes(actor.userId)}
                  onClick={() =>
                    onChange({
                      ...filters,
                      userIds: toggleInList(filters.userIds, actor.userId),
                    })
                  }
                />
              ))
            )}
          </div>
        </div>
      </div>

      <p className="activity-log-filters-count">
        {resultCount === 0 ? (
          "Aucun événement"
        ) : totalPages > 1 ? (
          <>
            {resultCount} événement{resultCount > 1 ? "s" : ""} · page{" "}
            {currentPage}/{totalPages}
          </>
        ) : (
          <>
            {resultCount} événement{resultCount > 1 ? "s" : ""}
          </>
        )}
      </p>
    </section>
  );
}
