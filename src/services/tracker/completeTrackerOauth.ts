import { fetchAniListViewer } from "@/services/tracker/anilistApi";
import { fetchMalViewer } from "@/services/tracker/malApi";
import {
  consumePendingTrackerProvider,
  exchangeMalAuthorizationCode,
  parseTrackerCallbackUrl,
  peekPendingTrackerProvider,
} from "@/services/tracker/trackerOauthService";
import {
  consumePendingTrackerDeepLink,
  consumeTrackerOauthPayload,
} from "@/services/tracker/trackerRedirectService";
import { upsertTrackerAccount } from "@/services/tracker/trackerTokenService";
import type { TrackerProvider } from "@/types/tracker";

/**
 * @description Finalise le callback OAuth tracker et enregistre le token du compte connecté.
 */
export async function completeTrackerOauthFromCallback(): Promise<{
  provider: TrackerProvider;
  username: string | null;
}> {
  const raw =
    consumePendingTrackerDeepLink() ??
    consumeTrackerOauthPayload() ??
    window.location.href;

  const parsed = parseTrackerCallbackUrl(raw);
  if (parsed.error) {
    throw new Error(parsed.error);
  }

  if (parsed.accessToken) {
    // AniList Implicit Grant
    consumePendingTrackerProvider();
    const viewer = await fetchAniListViewer(parsed.accessToken);
    const expiresAt =
      parsed.expiresIn != null
        ? new Date(Date.now() + parsed.expiresIn * 1000).toISOString()
        : null;

    await upsertTrackerAccount({
      provider: "anilist",
      accessToken: parsed.accessToken,
      expiresAt,
      externalUserId: String(viewer.id),
      externalUsername: viewer.name,
    });

    return { provider: "anilist", username: viewer.name };
  }

  if (parsed.code) {
    const provider = peekPendingTrackerProvider() ?? "mal";
    if (provider !== "mal") {
      throw new Error("Callback code inattendu pour ce provider.");
    }
    consumePendingTrackerProvider();
    const tokens = await exchangeMalAuthorizationCode(
      parsed.code,
      parsed.state,
    );
    const viewer = await fetchMalViewer(tokens.accessToken);
    await upsertTrackerAccount({
      provider: "mal",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      externalUserId: String(viewer.id),
      externalUsername: viewer.name,
    });
    return { provider: "mal", username: viewer.name };
  }

  throw new Error("Callback tracker sans code ni jeton.");
}
