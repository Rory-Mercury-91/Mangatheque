import { useEffect } from "react";

let lockCount = 0;
let touchMoveHandler: ((event: TouchEvent) => void) | null = null;

/**
 * @description Active le verrouillage du défilement sur `.app-main`.
 * @param main - Zone principale scrollable de l'application.
 */
function enableAppMainScrollLock(main: HTMLElement): void {
  lockCount += 1;
  if (lockCount > 1) {
    return;
  }

  main.classList.add("app-main--scroll-locked");

  touchMoveHandler = (event: TouchEvent) => {
    if (
      event.target instanceof Element &&
      event.target.closest(".app-scroll-lock-allow")
    ) {
      return;
    }
    event.preventDefault();
  };
  document.addEventListener("touchmove", touchMoveHandler, { passive: false });
}

/**
 * @description Désactive le verrouillage si plus aucun composant ne le demande.
 * @param main - Zone principale scrollable de l'application.
 */
function disableAppMainScrollLock(main: HTMLElement): void {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0) {
    return;
  }

  main.classList.remove("app-main--scroll-locked");

  if (touchMoveHandler) {
    document.removeEventListener("touchmove", touchMoveHandler);
    touchMoveHandler = null;
  }
}

/**
 * @description Bloque le défilement de la page principale (mobile / tiroirs ouverts).
 * Le contenu marqué `.app-scroll-lock-allow` reste défilable (ex. bandeau filtres).
 * @param locked - Active le verrou lorsque `true`.
 */
export function useAppMainScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) {
      return;
    }

    const main = document.querySelector<HTMLElement>(".app-main");
    if (!main) {
      return;
    }

    enableAppMainScrollLock(main);
    return () => disableAppMainScrollLock(main);
  }, [locked]);
}
