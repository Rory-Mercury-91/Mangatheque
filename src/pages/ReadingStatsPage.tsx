import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingOverlay, LoadingOverlayHost } from "@/components/common/LoadingOverlay";
import { ExportReadingHistoryButton } from "@/features/reading-stats/ExportReadingHistoryButton";
import { OwnerScopeSwitch } from "@/features/reading-stats/OwnerScopeSwitch";
import { ReadingProgressList } from "@/features/reading-stats/ReadingProgressList";
import { ReadingStatsOverview } from "@/features/reading-stats/ReadingStatsOverview";
import { ReadingStatusBreakdown } from "@/features/reading-stats/ReadingStatusBreakdown";
import { RecentReadingCarousel } from "@/features/reading-stats/RecentReadingCarousel";
import type { UserReadingStatus } from "@/constants/userReadingStatus";
import { deriveUserReadingStatus } from "@/constants/userReadingStatus";
import { useAuth } from "@/contexts/AuthContext";
import { useOwners } from "@/hooks/useOwners";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";
import { useWorks } from "@/hooks/useWorks";
import { fetchLibraryWorkMeta } from "@/services/libraryService";
import {
  buildUserReadingLibraryFilterPreset,
  saveLibraryFilterPreset,
} from "@/services/libraryFiltersPersistence";
import {
  fetchOwnersWithAccountLinks,
  type OwnerWithAccountLink,
} from "@/services/ownerAccountLinkService";
import {
  fetchLibraryUserReadingMeta,
  setChapterProgress,
} from "@/services/readingProgressService";
import { buildReadingStatsSnapshot } from "@/services/readingStatsService";
import type { LibraryUserReadingMeta, LibraryWorkMeta } from "@/types/libraryFilters";
import type {
  ReadingStatsOwnerScope,
  ReadingStatsSnapshot,
  ReadingWorkItem,
} from "@/types/readingStats";
import type { SyncReloadOptions } from "@/types/sync";
import { nextChapterProgressAfterIncrement, shouldKeepChapterReadingGap } from "@/utils/chapterReadingGap";
import { normalizeWorkReadingStatus } from "@/constants/workStatus";
import { resolveWorkTrackingProfile } from "@/utils/workTracking";
import { setMapIfChanged } from "@/utils/stateSync";
import "./ReadingStatsPage.css";

/**
 * @description Page de suivi de lecture sur tout le catalogue.
 * Le toggle choisit le compte lié (progression) ; édition seulement sur son propre toggle.
 */
export function ReadingStatsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { owners } = useOwners();
  const { works, loading: worksLoading, reload: reloadWorks } = useWorks();

  const [ownerScope, setOwnerScope] = useState<ReadingStatsOwnerScope>("all");
  const [ownerLinks, setOwnerLinks] = useState<OwnerWithAccountLink[]>([]);
  const [readingMetaByWork, setReadingMetaByWork] = useState<
    Map<string, LibraryUserReadingMeta>
  >(new Map());
  const [workMetaByWork, setWorkMetaByWork] = useState<
    Map<string, LibraryWorkMeta>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const worksSyncKey = useMemo(
    () => works.map((work) => `${work.id}:${work.updated_at}`).join("|"),
    [works],
  );

  const linkedUserIdByOwnerId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const owner of ownerLinks) {
      map.set(owner.id, owner.linkedUserId);
    }
    return map;
  }, [ownerLinks]);

  /**
   * Compte auth dont on affiche la progression :
   * - « Tous » → compte connecté
   * - propriétaire → son linked_user_id (null si non lié)
   */
  const progressUserId = useMemo(() => {
    if (ownerScope === "all") {
      return user?.id ?? null;
    }
    return linkedUserIdByOwnerId.get(ownerScope) ?? null;
  }, [linkedUserIdByOwnerId, ownerScope, user?.id]);

  const canEdit = useMemo(() => {
    if (!user?.id || ownerScope === "all") {
      return false;
    }
    return linkedUserIdByOwnerId.get(ownerScope) === user.id;
  }, [linkedUserIdByOwnerId, ownerScope, user?.id]);

  const selectedOwnerUnlinked =
    ownerScope !== "all" && linkedUserIdByOwnerId.get(ownerScope) == null;

  useEffect(() => {
    let cancelled = false;
    void fetchOwnersWithAccountLinks()
      .then((links) => {
        if (cancelled) {
          return;
        }
        setOwnerLinks(links);
        // Par défaut : pastille du compte connecté (édition possible)
        if (!user?.id) {
          return;
        }
        const mine = links.find((owner) => owner.linkedUserId === user.id);
        if (!mine) {
          return;
        }
        setOwnerScope((current) => (current === "all" ? mine.id : current));
      })
      .catch(() => {
        if (!cancelled) {
          setOwnerLinks([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const load = useCallback(
    async (options?: SyncReloadOptions) => {
      if (worksLoading) {
        return;
      }

      const silent = options?.silent ?? false;
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      try {
        const [readingMeta, workMeta] = await Promise.all([
          fetchLibraryUserReadingMeta(works, {
            targetUserId: progressUserId,
          }),
          fetchLibraryWorkMeta(),
        ]);
        setMapIfChanged(setReadingMetaByWork, readingMeta);
        setMapIfChanged(setWorkMetaByWork, workMeta);
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : "Erreur de chargement.");
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [works, worksLoading, ownerScope, progressUserId],
  );

  useEffect(() => {
    if (worksLoading) {
      return;
    }
    void load({ silent: hasLoadedRef.current });
    hasLoadedRef.current = true;
  }, [load, worksLoading, worksSyncKey]);

  useSupabaseSync(load);

  const snapshot = useMemo<ReadingStatsSnapshot | null>(() => {
    if (loading && readingMetaByWork.size === 0 && works.length > 0) {
      return null;
    }
    return buildReadingStatsSnapshot(
      works,
      readingMetaByWork,
      workMetaByWork,
      ownerScope,
    );
  }, [works, readingMetaByWork, workMetaByWork, ownerScope, loading]);

  const openLibraryWithStatus = useCallback(
    (status: UserReadingStatus) => {
      saveLibraryFilterPreset(
        buildUserReadingLibraryFilterPreset(
          status,
          ownerScope === "all" ? undefined : ownerScope,
        ),
      );
      navigate("/library/lectures");
    },
    [navigate, ownerScope],
  );

  /**
   * @description Ajoute 1 chapitre lu depuis la liste « En cours » (édition seule).
   */
  const handleIncrementChapter = useCallback(
    async (item: ReadingWorkItem) => {
      if (!canEdit) {
        return;
      }

      const work = works.find((entry) => entry.id === item.workId);
      const profile = work ? resolveWorkTrackingProfile(work) : null;
      const keepReadingGap = shouldKeepChapterReadingGap(
        work ? normalizeWorkReadingStatus(work.reading_status) : undefined,
        Boolean(profile?.hasChapterTracking),
      );
      const next = nextChapterProgressAfterIncrement(
        item.chaptersRead,
        item.chaptersTotal,
        keepReadingGap,
      );
      const saved = await setChapterProgress(
        item.workId,
        next.chaptersRead,
        next.catalogueFloor,
        {
          keepReadingGap,
          expandCatalogue: next.expandCatalogue,
        },
      );

      setReadingMetaByWork((previous) => {
        const current = previous.get(item.workId);
        if (!current) {
          return previous;
        }

        const chaptersRead = saved.chaptersRead;
        const chaptersTotal = Math.max(
          current.chaptersTotal,
          saved.chapterVfTotal,
        );
        const readCount = chaptersRead + current.volumesRead;
        const totalCount = chaptersTotal + current.volumesTotal;
        const nextMeta = new Map(previous);
        nextMeta.set(item.workId, {
          ...current,
          chaptersRead,
          chaptersTotal,
          readCount,
          totalCount,
          lastActivityAt: new Date().toISOString(),
          userReadingStatus: deriveUserReadingStatus(
            readCount,
            totalCount,
            current.userReadingStatus === "abandoned",
            { keepOngoingWhenCaughtUp: keepReadingGap },
          ),
        });
        return nextMeta;
      });

      await reloadWorks({ silent: true });
      await load({ silent: true });
    },
    [canEdit, load, reloadWorks, works],
  );

  if (loading && !snapshot) {
    return (
      <LoadingOverlayHost className="reading-stats-page">
        <header className="reading-stats-header">
          <h1>Suivi lectures</h1>
        </header>
        <LoadingOverlay message="Chargement du suivi de lecture…" />
      </LoadingOverlayHost>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="reading-stats-page">
        <header className="reading-stats-header">
          <h1>Suivi lectures</h1>
        </header>
        <p className="reading-stats-error">{error ?? "Données indisponibles."}</p>
      </div>
    );
  }

  return (
    <div className="reading-stats-page">
      <header className="reading-stats-header">
        <div className="reading-stats-header-main">
          <h1>Suivi lectures</h1>
          <p className="reading-stats-subtitle">
            Catalogue complet (toutes les séries). Le toggle choisit le compte
            lié dont on affiche la progression. L&apos;édition (+1) n&apos;est
            possible que sur le toggle lié à votre compte connecté.
          </p>
        </div>
        <OwnerScopeSwitch
          owners={owners}
          value={ownerScope}
          onChange={setOwnerScope}
        />
      </header>

      {selectedOwnerUnlinked ? (
        <p className="reading-stats-error" role="status">
          Ce propriétaire n&apos;est pas lié à un compte. Liez-le dans Journal →
          Comptes pour afficher sa progression.
        </p>
      ) : null}

      {!canEdit && !selectedOwnerUnlinked ? (
        <p className="reading-stats-readonly" role="status">
          Consultation seule — passez sur votre pastille propriétaire pour
          modifier la progression.
        </p>
      ) : null}

      <ExportReadingHistoryButton
        readingItems={snapshot.allWorks}
        progressUserId={progressUserId}
      />

      <section className="reading-stats-section">
        <h2>Aperçu</h2>
        <ReadingStatsOverview snapshot={snapshot} />
      </section>

      <section className="reading-stats-section">
        <h2>Statut des séries</h2>
        <ReadingStatusBreakdown
          snapshot={snapshot}
          onStatusClick={openLibraryWithStatus}
        />
      </section>

      <section className="reading-stats-section">
        <h2>Dernières lectures</h2>
        <RecentReadingCarousel items={snapshot.recentWorks} />
      </section>

      <section className="reading-stats-section">
        <h2>En cours</h2>
        <ReadingProgressList
          items={snapshot.ongoingWorks}
          onIncrementChapter={
            canEdit ? handleIncrementChapter : undefined
          }
        />
      </section>
    </div>
  );
}
