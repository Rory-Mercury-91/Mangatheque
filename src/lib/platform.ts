/**
 * @description Indique si l'application tourne dans le shell Tauri (desktop).
 * @returns true dans la fenêtre native Tauri.
 */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
