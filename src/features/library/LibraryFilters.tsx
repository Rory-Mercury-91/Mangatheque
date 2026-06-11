import { Search } from "lucide-react";
import { TogglePill } from "@/components/common/TogglePill";
import type { Owner } from "@/types/database";
import type { LibraryFiltersState, LibrarySortKey } from "@/types/libraryFilters";
import "./LibraryFilters.css";

export interface LibraryFiltersProps {
  filters: LibraryFiltersState;
  owners: Owner[];
  demographics: string[];
  tags: string[];
  resultCount: number;
  totalCount: number;
  onChange: (next: LibraryFiltersState) => void;
}

const SORT_OPTIONS: Array<{ value: LibrarySortKey; label: string }> = [
  { value: "created_desc", label: "Ajout récent" },
  { value: "created_asc", label: "Ajout ancien" },
  { value: "price_desc", label: "Prix ↓" },
  { value: "price_asc", label: "Prix ↑" },
];

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
  onChange,
}: LibraryFiltersProps) {
  function toggleInList(list: string[], value: string): string[] {
    return list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];
  }

  const hasActiveFilters =
    filters.search.trim().length > 0 ||
    filters.ownerIds.length > 0 ||
    filters.mihonOnly ||
    filters.demographics.length > 0 ||
    filters.tags.length > 0;

  return (
    <section className="library-filters" aria-label="Filtres bibliothèque">
      <div className="library-filters-row library-filters-row--search">
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
      </div>

      <div className="library-filters-row">
        <span className="library-filters-label">Propriétaire</span>
        <div className="library-filters-pills">
          {owners.map((owner) => (
            <TogglePill
              key={owner.id}
              label={owner.badge_label ?? owner.name.charAt(0).toUpperCase()}
              color={owner.color}
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
            label="Mihon"
            color="#34d399"
            active={filters.mihonOnly}
            onClick={() =>
              onChange({ ...filters, mihonOnly: !filters.mihonOnly })
            }
          />
        </div>
      </div>

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
                    demographics: toggleInList(filters.demographics, demo),
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

      <p className="library-filters-count">
        {resultCount} / {totalCount} œuvre{totalCount > 1 ? "s" : ""}
        {hasActiveFilters ? (
          <button
            type="button"
            className="library-filters-reset"
            onClick={() =>
              onChange({
                ...filters,
                search: "",
                ownerIds: [],
                mihonOnly: false,
                demographics: [],
                tags: [],
              })
            }
          >
            Réinitialiser les filtres
          </button>
        ) : null}
      </p>
    </section>
  );
}
