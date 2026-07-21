import type { TrackerSyncResult } from "@/types/tracker";

/**
 * @description Message court après une sync tracker bidirectionnelle.
 */
export function formatTrackerSyncMessage(
  result: TrackerSyncResult,
  fallback: string,
): string {
  const pushLabel =
    result.pushedProviders && result.pushedProviders.length > 0
      ? `push ${result.pushedProviders
          .map((p) => (p === "mal" ? "MAL" : "AniList"))
          .join(" + ")}`
      : null;

  const pushErrorLabel =
    result.pushErrors && result.pushErrors.length > 0
      ? result.pushErrors.join(" · ")
      : null;

  return (
    [
      result.remoteChapters != null ? `API ${result.remoteChapters} ch.` : null,
      result.chaptersApplied != null
        ? `appliqué ${result.chaptersApplied}`
        : null,
      result.volumesApplied != null ? `${result.volumesApplied} tomes` : null,
      pushLabel,
      pushErrorLabel,
    ]
      .filter(Boolean)
      .join(" · ") || fallback
  );
}
