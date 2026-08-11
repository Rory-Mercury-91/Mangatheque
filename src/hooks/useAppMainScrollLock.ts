import { useEffect } from "react";

let lockCount = 0;
let touchMoveHandler: ((event: TouchEvent) => void) | null = null;
let wheelHandler: ((event: WheelEvent) => void) | null = null;

/**
 * @description Indique si un élément est un conteneur défilable.
 */
function isScrollContainer(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const overflowX = style.overflowX;
  const overflowY = style.overflowY;
  const canScrollX =
    (overflowX === "auto" || overflowX === "scroll") &&
    element.scrollWidth > element.clientWidth + 1;
  const canScrollY =
    (overflowY === "auto" || overflowY === "scroll") &&
    element.scrollHeight > element.clientHeight + 1;
  return canScrollX || canScrollY;
}

/**
 * @description Indique si un élément peut encore défiler selon le delta.
 */
function canElementScroll(
  element: HTMLElement,
  deltaX: number,
  deltaY: number,
): boolean {
  if (!isScrollContainer(element)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  const overflowX = style.overflowX;
  const overflowY = style.overflowY;
  const canScrollX =
    (overflowX === "auto" || overflowX === "scroll") &&
    element.scrollWidth > element.clientWidth + 1;
  const canScrollY =
    (overflowY === "auto" || overflowY === "scroll") &&
    element.scrollHeight > element.clientHeight + 1;

  if (Math.abs(deltaY) >= Math.abs(deltaX)) {
    if (!canScrollY || deltaY === 0) {
      return false;
    }
    if (deltaY < 0) {
      return element.scrollTop > 0;
    }
    return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
  }

  if (!canScrollX || deltaX === 0) {
    return false;
  }
  if (deltaX < 0) {
    return element.scrollLeft > 0;
  }
  return element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
}

/**
 * @description Remonte jusqu'à la zone autorisée pour trouver un conteneur utile.
 */
function walkAllowZone(
  start: EventTarget | null,
  predicate: (element: HTMLElement) => boolean,
): HTMLElement | null {
  if (!(start instanceof Element)) {
    return null;
  }

  const allowRoot = start.closest(".app-scroll-lock-allow");
  if (!allowRoot) {
    return null;
  }

  let current: HTMLElement | null =
    start instanceof HTMLElement ? start : start.parentElement;

  while (current && allowRoot.contains(current)) {
    if (predicate(current)) {
      return current;
    }
    if (current === allowRoot) {
      break;
    }
    current = current.parentElement;
  }

  return null;
}

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
  document.documentElement.classList.add("app-scroll-locked");
  document.body.classList.add("app-scroll-locked");

  touchMoveHandler = (event: TouchEvent) => {
    if (walkAllowZone(event.target, isScrollContainer)) {
      return;
    }
    event.preventDefault();
  };
  document.addEventListener("touchmove", touchMoveHandler, { passive: false });

  wheelHandler = (event: WheelEvent) => {
    const scrollable = walkAllowZone(event.target, (element) =>
      canElementScroll(element, event.deltaX, event.deltaY),
    );
    if (scrollable) {
      return;
    }
    event.preventDefault();
  };
  document.addEventListener("wheel", wheelHandler, { passive: false });
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
  document.documentElement.classList.remove("app-scroll-locked");
  document.body.classList.remove("app-scroll-locked");

  if (touchMoveHandler) {
    document.removeEventListener("touchmove", touchMoveHandler);
    touchMoveHandler = null;
  }
  if (wheelHandler) {
    document.removeEventListener("wheel", wheelHandler);
    wheelHandler = null;
  }
}

/**
 * @description Bloque le défilement de la page principale (modales, tiroirs…).
 * Le contenu marqué `.app-scroll-lock-allow` reste défilable tant qu'il
 * peut encore absorber le geste (pas de chaînage vers la page derrière).
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
