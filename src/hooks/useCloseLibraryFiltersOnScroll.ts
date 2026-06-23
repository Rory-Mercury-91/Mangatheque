import { useEffect } from "react";

/**
 * @description Replie les panneaux de filtres tactiles au défilement de `.app-main`.
 * @param enabled - Active l'écoute du scroll.
 * @param onClose - Callback de repli des volets ouverts.
 */
export function useCloseLibraryFiltersOnScroll(
  enabled: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const main = document.querySelector<HTMLElement>(".app-main");
    if (!main) {
      return;
    }

    const handleScroll = () => {
      onClose();
    };

    main.addEventListener("scroll", handleScroll, { passive: true });
    return () => main.removeEventListener("scroll", handleScroll);
  }, [enabled, onClose]);
}
