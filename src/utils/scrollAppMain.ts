/**
 * @description Remonte le contenu principal (zone scroll AppLayout) en haut.
 */
export function scrollAppMainToTop(behavior: ScrollBehavior = "smooth"): void {
  document.querySelector(".app-main")?.scrollTo({ top: 0, behavior });
}
