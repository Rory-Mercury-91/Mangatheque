import { useEffect, type RefObject } from "react";

const SCROLL_ROOT_SELECTOR =
  ".modal-body--scroll, .modal-body, .app-main";

/**
 * @description Replie une section si son en-tête défile au-dessus du conteneur scrollable parent.
 * @param enabled - Active l'observation (mobile / tablette tactile).
 * @param open - Section actuellement dépliée.
 * @param sectionRef - Référence vers l'élément racine de la section.
 * @param onCollapse - Callback de repli.
 */
export function useAutoCollapseWhenObscured(
  enabled: boolean,
  open: boolean,
  sectionRef: RefObject<HTMLElement | null>,
  onCollapse: () => void,
): void {
  useEffect(() => {
    if (!enabled || !open) {
      return;
    }

    const section = sectionRef.current;
    if (!section) {
      return;
    }

    const header = section.querySelector<HTMLElement>(".collapse-header");
    if (!header) {
      return;
    }

    const scrollRoot = section.closest(SCROLL_ROOT_SELECTOR);
    if (!scrollRoot) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry || entry.isIntersecting) {
          return;
        }

        const rootTop = scrollRoot.getBoundingClientRect().top;
        if (entry.boundingClientRect.top < rootTop - 4) {
          onCollapse();
        }
      },
      { root: scrollRoot, threshold: 0 },
    );

    observer.observe(header);
    return () => observer.disconnect();
  }, [enabled, open, onCollapse, sectionRef]);
}
