declare const __APP_VERSION__: string;

/**
 * @description Retourne la version applicative embarquee au build (alignee sur package.json).
 */
export function getAppVersion(): string {
  return __APP_VERSION__;
}
