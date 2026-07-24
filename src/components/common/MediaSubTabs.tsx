import { NavLink } from "react-router-dom";
import "./MediaSubTabs.css";

export interface MediaSubTabItem {
  to: string;
  label: string;
  end?: boolean;
}

export interface MediaSubTabsProps {
  items: MediaSubTabItem[];
  ariaLabel: string;
}

/**
 * @description Sous-onglets horizontaux (Bibliothèque / Suivi).
 */
export function MediaSubTabs({ items, ariaLabel }: MediaSubTabsProps) {
  return (
    <nav className="media-sub-tabs" aria-label={ariaLabel} role="tablist">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          role="tab"
          className={({ isActive }) =>
            ["media-sub-tab", isActive ? "media-sub-tab--active" : ""]
              .filter(Boolean)
              .join(" ")
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
