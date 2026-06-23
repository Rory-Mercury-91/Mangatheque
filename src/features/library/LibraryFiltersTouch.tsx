import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
import type { LibraryPrimaryFilterGroupId } from "@/features/library/libraryPrimaryFilterGroups";

export type TouchPrimaryFilterTab = LibraryPrimaryFilterGroupId;
export type TouchMetaFilterTab = "demo" | "tags";

export interface FilterAccordionTabConfig {
  id: string;
  label: string;
  icon?: string;
  hasActiveFilters: boolean;
  panel: ReactNode;
}

interface FilterAccordionProps {
  tabs: FilterAccordionTabConfig[];
  activeTabId: string | null;
  onTabChange: (tabId: string | null) => void;
  panelClassName?: string;
}

/**
 * @description Rangée d'onglets + panneau dépliable pour les filtres tactiles.
 */
function FilterAccordion({
  tabs,
  activeTabId,
  onTabChange,
  panelClassName = "",
}: FilterAccordionProps) {
  if (tabs.length === 0) {
    return null;
  }

  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  return (
    <div className="library-filters-accordion">
      <div
        className="library-filters-accordion-tabs"
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
            panelClassName,
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

export interface LibraryFiltersTouchPhoneProps {
  primaryTabs: FilterAccordionTabConfig[];
  metaTabs: FilterAccordionTabConfig[];
  primaryTab: TouchPrimaryFilterTab | null;
  metaTab: TouchMetaFilterTab | null;
  onPrimaryTabChange: (tab: TouchPrimaryFilterTab | null) => void;
  onMetaTabChange: (tab: TouchMetaFilterTab | null) => void;
}

/**
 * @description Filtres mobile : deux accordéons (compte/statut + démo/genres).
 */
export function LibraryFiltersTouchPhone({
  primaryTabs,
  metaTabs,
  primaryTab,
  metaTab,
  onPrimaryTabChange,
  onMetaTabChange,
}: LibraryFiltersTouchPhoneProps) {
  return (
    <div className="library-filters-touch-layout library-filters-touch-layout--phone">
      <FilterAccordion
        tabs={primaryTabs}
        activeTabId={primaryTab}
        onTabChange={(tabId) =>
          onPrimaryTabChange(tabId as TouchPrimaryFilterTab | null)
        }
      />
      <FilterAccordion
        tabs={metaTabs}
        activeTabId={metaTab}
        onTabChange={(tabId) =>
          onMetaTabChange(tabId as TouchMetaFilterTab | null)
        }
        panelClassName="library-filters-accordion-panel--meta"
      />
    </div>
  );
}

export interface LibraryFiltersTouchTabletProps {
  primaryTabs: FilterAccordionTabConfig[];
  metaTabs: FilterAccordionTabConfig[];
  primaryTab: TouchPrimaryFilterTab | null;
  metaTab: TouchMetaFilterTab | null;
  onPrimaryTabChange: (tab: TouchPrimaryFilterTab | null) => void;
  onMetaTabChange: (tab: TouchMetaFilterTab | null) => void;
}

/**
 * @description Filtres tablette : accordéons horizontaux (profil/statut + démo/genres).
 */
export function LibraryFiltersTouchTablet({
  primaryTabs,
  metaTabs,
  primaryTab,
  metaTab,
  onPrimaryTabChange,
  onMetaTabChange,
}: LibraryFiltersTouchTabletProps) {
  return (
    <div className="library-filters-touch-layout library-filters-touch-layout--tablet">
      <FilterAccordion
        tabs={primaryTabs}
        activeTabId={primaryTab}
        onTabChange={(tabId) =>
          onPrimaryTabChange(tabId as TouchPrimaryFilterTab | null)
        }
      />
      <FilterAccordion
        tabs={metaTabs}
        activeTabId={metaTab}
        onTabChange={(tabId) =>
          onMetaTabChange(tabId as TouchMetaFilterTab | null)
        }
        panelClassName="library-filters-accordion-panel--meta"
      />
    </div>
  );
}
