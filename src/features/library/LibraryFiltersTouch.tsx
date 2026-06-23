import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
import type { LibraryMetaFilterGroupId } from "@/features/library/libraryMetaFilterGroups";
import type { LibraryPrimaryFilterGroupId } from "@/features/library/libraryPrimaryFilterGroups";

export type TouchPrimaryFilterTab = LibraryPrimaryFilterGroupId;
export type TouchMetaFilterTab = LibraryMetaFilterGroupId;
export type TouchFilterTab = TouchPrimaryFilterTab | TouchMetaFilterTab;

export interface FilterAccordionTabConfig {
  id: string;
  label: string;
  icon?: string;
  hasActiveFilters: boolean;
  panel: ReactNode;
  panelClassName?: string;
}

interface FilterAccordionProps {
  tabs: FilterAccordionTabConfig[];
  activeTabId: string | null;
  onTabChange: (tabId: string | null) => void;
  tabsClassName?: string;
}

/**
 * @description Rangée d'onglets + panneau dépliable pour les filtres tactiles.
 */
function FilterAccordion({
  tabs,
  activeTabId,
  onTabChange,
  tabsClassName = "",
}: FilterAccordionProps) {
  if (tabs.length === 0) {
    return null;
  }

  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  return (
    <div className="library-filters-accordion">
      <div
        className={[
          "library-filters-accordion-tabs",
          tabsClassName,
        ]
          .filter(Boolean)
          .join(" ")}
        role="tablist"
        aria-label="Catégories de filtres"
      >
        {tabs.map((tab) => {
          const isOpen = activeTabId === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className={[
                "library-filters-accordion-tab",
                isOpen ? "library-filters-accordion-tab--open" : "",
                tab.hasActiveFilters ? "library-filters-accordion-tab--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-selected={isOpen}
              aria-expanded={isOpen}
              aria-label={tab.label}
              onClick={() => onTabChange(isOpen ? null : tab.id)}
            >
              {tab.icon ? (
                <span className="library-filters-accordion-tab-icon" aria-hidden>
                  {tab.icon}
                </span>
              ) : null}
              <span className="library-filters-accordion-tab-text">{tab.label}</span>
              {isOpen ? (
                <ChevronUp size={16} aria-hidden />
              ) : (
                <ChevronDown size={16} aria-hidden />
              )}
              {tab.hasActiveFilters && !isOpen ? (
                <span className="library-filters-accordion-tab-badge" aria-hidden>
                  •
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {activeTab ? (
        <div
          className={[
            "library-filters-accordion-panel",
            activeTab.panelClassName ?? "",
          ]
            .filter(Boolean)
            .join(" ")}
          role="tabpanel"
        >
          {activeTab.panel}
        </div>
      ) : null}
    </div>
  );
}

export interface LibraryFiltersTouchProps {
  primaryTabs: FilterAccordionTabConfig[];
  metaTabs: FilterAccordionTabConfig[];
  primaryTab: TouchPrimaryFilterTab | null;
  metaTab: TouchMetaFilterTab | null;
  onPrimaryTabChange: (tab: TouchPrimaryFilterTab | null) => void;
  onMetaTabChange: (tab: TouchMetaFilterTab | null) => void;
  variant: "phone" | "tablet";
}

/**
 * @description Filtres tactiles : deux rangées (4 principaux + démo/genres).
 */
export function LibraryFiltersTouch({
  primaryTabs,
  metaTabs,
  primaryTab,
  metaTab,
  onPrimaryTabChange,
  onMetaTabChange,
  variant,
}: LibraryFiltersTouchProps) {
  return (
    <div
      className={`library-filters-touch-layout library-filters-touch-layout--${variant}`}
    >
      <FilterAccordion
        tabs={primaryTabs}
        activeTabId={primaryTab}
        tabsClassName="library-filters-accordion-tabs--primary"
        onTabChange={(tabId) =>
          onPrimaryTabChange(tabId as TouchPrimaryFilterTab | null)
        }
      />
      {metaTabs.length > 0 ? (
        <FilterAccordion
          tabs={metaTabs}
          activeTabId={metaTab}
          tabsClassName="library-filters-accordion-tabs--meta"
          onTabChange={(tabId) =>
            onMetaTabChange(tabId as TouchMetaFilterTab | null)
          }
        />
      ) : null}
    </div>
  );
}
