import { useCallback, useEffect, useMemo, useState } from "react";
import "./WorkDetailSectionNav.css";

export interface WorkDetailSectionNavItem {
  id: string;
  label: string;
}

export interface WorkDetailSectionNavProps {
  items: WorkDetailSectionNavItem[];
}

/**
 * @description Accès rapide : boutons qui scrollent vers les sections de la fiche.
 */
export function WorkDetailSectionNav({ items }: WorkDetailSectionNavProps) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);

  const visibleItems = useMemo(
    () => items.filter((item) => Boolean(item.id && item.label)),
    [items],
  );

  useEffect(() => {
    if (visibleItems.length === 0) {
      setActiveId(null);
      return;
    }

    const elements = visibleItems
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (elements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              (a.boundingClientRect.top ?? 0) - (b.boundingClientRect.top ?? 0),
          );
        const top = visible[0]?.target;
        if (top?.id) {
          setActiveId(top.id);
        }
      },
      {
        root: null,
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0, 0.2, 0.5],
      },
    );

    for (const el of elements) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [visibleItems]);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  }, []);

  if (visibleItems.length < 2) {
    return null;
  }

  return (
    <nav
      className="work-detail-section-nav"
      aria-label="Accès rapide aux sections"
    >
      <ul className="work-detail-section-nav-list">
        {visibleItems.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`work-detail-section-nav-btn${
                activeId === item.id
                  ? " work-detail-section-nav-btn--active"
                  : ""
              }`}
              onClick={() => scrollTo(item.id)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
