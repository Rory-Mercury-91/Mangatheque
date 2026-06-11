import { getAppVersion } from "@/lib/appVersion";
import { isAndroidRuntime, isDesktopRuntime } from "@/lib/platform";

const GITHUB_REPO = "Rory-Mercury-91/Mangatheque";

export type UpdateInfo =
  | { kind: "desktop"; version: string; notes?: string }
  | { kind: "android"; version: string; downloadUrl: string; notes?: string };

/**
 * @description Compare deux versions semver X.Y.Z.
 */
function isNewerVersion(latest: string, current: string): boolean {
  const parse = (value: string) =>
    value.replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10) || 0);

  const latestParts = parse(latest);
  const currentParts = parse(current);

  for (let index = 0; index < 3; index += 1) {
    const left = latestParts[index] ?? 0;
    const right = currentParts[index] ?? 0;
    if (left > right) {
      return true;
    }
    if (left < right) {
      return false;
    }
  }

  return false;
}

/**
 * @description Verifie les mises a jour desktop via le plugin Tauri updater.
 */
export async function checkDesktopUpdate(): Promise<UpdateInfo | null> {
  if (!isDesktopRuntime()) {
    return null;
  }

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      return null;
    }

    return {
      kind: "desktop",
      version: update.version,
      notes: update.body ?? undefined,
    };
  } catch (error) {
    console.warn("Verification mise a jour desktop impossible :", error);
    return null;
  }
}

/**
 * @description Verifie les mises a jour Android via l'API GitHub Releases.
 */
export async function checkAndroidUpdate(): Promise<UpdateInfo | null> {
  if (!isAndroidRuntime()) {
    return null;
  }

  const current = getAppVersion();

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      tag_name?: string;
      body?: string;
      assets?: Array<{ name?: string; browser_download_url?: string }>;
    };

    const latestVersion = payload.tag_name?.replace(/^v/i, "") ?? "";
    if (!latestVersion || !isNewerVersion(latestVersion, current)) {
      return null;
    }

    const apkAsset = payload.assets?.find((asset) =>
      asset.name?.toLowerCase().includes("android") &&
      asset.name?.toLowerCase().endsWith(".apk"),
    );

    if (!apkAsset?.browser_download_url) {
      return null;
    }

    return {
      kind: "android",
      version: latestVersion,
      downloadUrl: apkAsset.browser_download_url,
      notes: payload.body ?? undefined,
    };
  } catch (error) {
    console.warn("Verification mise a jour Android impossible :", error);
    return null;
  }
}

/**
 * @description Detecte une mise a jour selon la plateforme courante.
 */
export async function checkForAppUpdate(): Promise<UpdateInfo | null> {
  if (isDesktopRuntime()) {
    return checkDesktopUpdate();
  }

  if (isAndroidRuntime()) {
    return checkAndroidUpdate();
  }

  return null;
}

/**
 * @description Telecharge et installe une mise a jour desktop, puis relance l'app.
 */
export async function installDesktopUpdate(): Promise<void> {
  const { check } = await import("@tauri-apps/plugin-updater");
  const { relaunch } = await import("@tauri-apps/plugin-process");
  const update = await check();
  if (!update) {
    return;
  }

  await update.downloadAndInstall();
  await relaunch();
}

/**
 * @description Ouvre la page de telechargement de l'APK sur GitHub.
 */
export async function openAndroidUpdateDownload(downloadUrl: string): Promise<void> {
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(downloadUrl);
}
