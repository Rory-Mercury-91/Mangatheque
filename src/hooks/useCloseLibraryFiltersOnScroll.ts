import { useEffect, useRef } from "react";

/** Seuil minimal de déplacement vertical pour considérer un scroll utilisateur. */
const SCROLL_CLOSE_THRESHOLD_PX = 12;

/**
 * @description Replie les panneaux de filtres tactiles lors d'un défilement volontaire de `.app-main`.
 * @param enabled - Active l'écoute du scroll.
 * @param onClose - Callback de repli des volets ouverts.
 */
export function useCloseLibraryFiltersOnScroll(
  enabled: boolean,
  onClose: () => void,
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const main = document.querySelector<HTMLElement>(".app-main");
    if (!main) {
      return;
    }

    let lastScrollTop = main.scrollTop;
    let userInitiatedScroll = false;

    const resetUserScrollIntent = () => {
      userInitiatedScroll = false;
      lastScrollTop = main.scrollTop;
    };

    const markUserScrollIntent = () => {
      userInitiatedScroll = true;
    };

    const handleScroll = () => {
      if (!userInitiatedScroll) {
        lastScrollTop = main.scrollTop;
        return;
      }

      const currentScrollTop = main.scrollTop;
      if (
        Math.abs(currentScrollTop - lastScrollTop) >= SCROLL_CLOSE_THRESHOLD_PX
      ) {
        onCloseRef.current();
        userInitiatedScroll = false;
      }
      lastScrollTop = currentScrollTop;
    };

    main.addEventListener("touchstart", resetUserScrollIntent, { passive: true });
    main.addEventListener("touchmove", markUserScrollIntent, { passive: true });
    main.addEventListener("wheel", markUserScrollIntent, { passive: true });
    main.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      main.removeEventListener("touchstart", resetUserScrollIntent);
      main.removeEventListener("touchmove", markUserScrollIntent);
      main.removeEventListener("wheel", markUserScrollIntent);
      main.removeEventListener("scroll", handleScroll);
    };
  }, [enabled]);
}
