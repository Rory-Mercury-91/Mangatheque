/**
 * @description Indique si l'application tourne en mode développement Vite.
 */
export function isDevBuild(): boolean {
  return import.meta.env.DEV;
}
