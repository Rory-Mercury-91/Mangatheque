import { RotateCcw, Search } from "lucide-react";
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
];

/**
 * @description Barre de recherche et filtres du journal d'activité.
 */
export function ActivityLogFilters({
  filters,
  actors,
  resultCount,
  currentPage,
  totalPages,
  onChange,
}: ActivityLogFiltersProps) {
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

  const hasActiveFilters =
    filters.search.trim().length > 0 ||
    filters.actionTypes.length > 0 ||
    filters.userIds.length > 0;

  return (
    <section className="activity-log-filters" aria-label="Filtres journal">
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

      <div className="activity-log-filters-footer">
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
        {hasActiveFilters ? (
          <button
            type="button"
            className="activity-log-filters-reset"
            onClick={resetFilters}
          >
            <RotateCcw size={16} aria-hidden />
            Réinitialiser
          </button>
        ) : null}
      </div>
    </section>
  );
}
