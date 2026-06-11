/**
 * @description Indique si l'application tourne dans le shell Tauri.
 * @returns true dans la fenêtre native Tauri (desktop ou mobile).
 */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * @description Indique si l'application tourne sur Android (WebView Tauri).
 */
export function isAndroidRuntime(): boolean {
  return (
    isTauriRuntime() &&
    typeof navigator !== "undefined" &&
    /android/i.test(navigator.userAgent)
  );
}

/**
 * @description Indique si l'application tourne sur iOS (WebView Tauri).
 */
export function isIosRuntime(): boolean {
  return (
    isTauriRuntime() &&
    typeof navigator !== "undefined" &&
    /iphone|ipad|ipod/i.test(navigator.userAgent)
  );
}

/**
 * @description Indique si l'application tourne sur une cible mobile Tauri (Android ou iOS).
 */
export function isMobileRuntime(): boolean {
  return isAndroidRuntime() || isIosRuntime();
}

/**
 * @description Indique si l'application tourne sur le binaire desktop Tauri.
 */
export function isDesktopRuntime(): boolean {
  return isTauriRuntime() && !isMobileRuntime();
}
