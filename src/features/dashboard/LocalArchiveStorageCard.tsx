import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { getOwnerColor, getOwnerDisplayName } from "@/constants/ownerColors";
import { useOwners } from "@/hooks/useOwners";
import {
  fetchLocalArchiveStorageSummary,
  fetchLocalArchiveTreesByOwner,
  type LocalArchiveStorageSummary,
  type LocalArchiveTreeDemographicBranch,
} from "@/services/workLocalArchiveService";
import { formatByteSize } from "@/utils/formatByteSize";
import { resolveErrorMessage } from "@/utils/errorMessage";
import "./LocalArchiveStorageCard.css";

type TreePlacement = {
  left: number;
  width: number;
  maxHeight: number;
  /** Ancré en bas de la zone (ouvre vers le haut) ou en haut (vers le bas). */
  bottom?: number;
  top?: number;
};

/**
 * @description Calcule un placement dans le viewport, en priorisant l'ouverture vers le haut.
 */
function computeTreePlacement(anchor: DOMRect): TreePlacement {
  const gap = 8;
  const margin = 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(Math.max(anchor.width, 220), 320);
  let left = anchor.left + (anchor.width - width) / 2;
  left = Math.min(Math.max(margin, left), viewportWidth - width - margin);

  const spaceAbove = Math.max(0, anchor.top - margin - gap);
  const spaceBelow = Math.max(0, viewportHeight - anchor.bottom - margin - gap);
  const preferUp = spaceAbove >= 160 || spaceAbove >= spaceBelow;

  if (preferUp && spaceAbove >= 120) {
    return {
      left,
      width,
      bottom: viewportHeight - anchor.top + gap,
      maxHeight: Math.min(spaceAbove, Math.floor(viewportHeight * 0.7)),
    };
  }

  return {
    left,
    width,
    top: anchor.bottom + gap,
    maxHeight: Math.min(
      Math.max(spaceBelow, 140),
      Math.floor(viewportHeight * 0.7),
    ),
  };
}

/**
 * @description Arborescence affichée au survol d'une carte propriétaire.
 */
function ArchiveTreePopover({
  ownerLabel,
  tree,
  placement,
  onMouseEnter,
  onMouseLeave,
}: {
  ownerLabel: string;
  tree: LocalArchiveTreeDemographicBranch[];
  placement: TreePlacement;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const style: CSSProperties = {
    left: placement.left,
    width: placement.width,
    maxHeight: placement.maxHeight,
    ...(placement.bottom != null
      ? { bottom: placement.bottom, top: "auto" }
      : { top: placement.top, bottom: "auto" }),
  };

  return createPortal(
    <div
      className="local-archive-storage-tree local-archive-storage-tree--portal"
      role="tooltip"
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <p className="local-archive-storage-tree-title">{ownerLabel}</p>
      {tree.length === 0 ? (
        <p className="local-archive-storage-tree-empty">Aucune archive liée.</p>
      ) : (
        <ul className="local-archive-storage-tree-root">
          {tree.map((demo) => (
            <li key={demo.demographicFolder}>
              <span className="local-archive-storage-tree-demo">
                {demo.demographicFolder}
              </span>
              <ul>
                {demo.statuses.map((status) => (
                  <li key={`${demo.demographicFolder}:${status.statusFolder}`}>
                    <span className="local-archive-storage-tree-status">
                      {status.statusFolder}
                    </span>
                    <ul>
                      {status.series.map((series) => (
                        <li
                          key={series.rootPath}
                          className="local-archive-storage-tree-series"
                          title={series.rootPath}
                        >
                          <span>{series.title}</span>
                          <span className="local-archive-storage-tree-size">
                            {formatByteSize(series.sizeBytes)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>,
    document.body,
  );
}

/**
 * @description Carte propriétaire avec popover d'arborescence au survol.
 */
function OwnerStorageCard({
  ownerId,
  ownerName,
  archiveCount,
  sizeBytes,
  tree,
}: {
  ownerId: string | null;
  ownerName: string;
  archiveCount: number;
  sizeBytes: number;
  tree: LocalArchiveTreeDemographicBranch[];
}) {
  const cardRef = useRef<HTMLElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<TreePlacement | null>(null);
  const label = ownerId ? getOwnerDisplayName(ownerName) : ownerName;

  const clearCloseTimer = () => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openPopover = () => {
    clearCloseTimer();
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    setPlacement(computeTreePlacement(rect));
    setOpen(true);
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setPlacement(null);
      closeTimerRef.current = null;
    }, 120);
  };

  useLayoutEffect(() => {
    if (!open || !cardRef.current) {
      return;
    }
    const update = () => {
      const rect = cardRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      setPlacement(computeTreePlacement(rect));
    };
    update();
    window.addEventListener("resize", update);
    // `.app-main` est la zone scrollable de l'app.
    const main = document.querySelector(".app-main");
    main?.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("resize", update);
      main?.removeEventListener("scroll", update);
    };
  }, [open]);

  useEffect(() => {
    return () => clearCloseTimer();
  }, []);

  return (
    <article
      ref={cardRef}
      className={[
        "local-archive-storage-card",
        "local-archive-storage-card--owner",
        open ? "is-tree-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          "--owner-color": ownerId ? getOwnerColor(ownerName) : "#6b7280",
        } as CSSProperties
      }
      onMouseEnter={openPopover}
      onMouseLeave={scheduleClose}
      onFocus={openPopover}
      onBlur={scheduleClose}
    >
      <span className="local-archive-storage-label">{label}</span>
      <strong>{formatByteSize(sizeBytes)}</strong>
      <span className="local-archive-storage-sub">
        {archiveCount} série{archiveCount > 1 ? "s" : ""}
      </span>
      {open && placement ? (
        <ArchiveTreePopover
          ownerLabel={label}
          tree={tree}
          placement={placement}
          onMouseEnter={openPopover}
          onMouseLeave={scheduleClose}
        />
      ) : null}
    </article>
  );
}

/**
 * @description Carte tableau de bord : poids total des archives locales du foyer.
 */
export function LocalArchiveStorageCard() {
  const { owners } = useOwners();
  const [summary, setSummary] = useState<LocalArchiveStorageSummary | null>(
    null,
  );
  const [treesByOwner, setTreesByOwner] = useState(
    () => new Map<string | null, LocalArchiveTreeDemographicBranch[]>(),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchLocalArchiveStorageSummary(),
      fetchLocalArchiveTreesByOwner(),
    ])
      .then(([data, trees]) => {
        if (!cancelled) {
          setSummary(data);
          setTreesByOwner(trees);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            resolveErrorMessage(err, "Stockage archives indisponible."),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ownerRows = useMemo(() => {
    const byOwner = new Map(
      (summary?.byOwner ?? []).map((row) => [row.ownerId, row]),
    );
    const rows = owners.map((owner) => {
      const hit = byOwner.get(owner.id);
      return {
        ownerId: owner.id as string | null,
        ownerName: owner.name,
        archiveCount: hit?.archiveCount ?? 0,
        sizeBytes: hit?.sizeBytes ?? 0,
      };
    });
    const unassigned = byOwner.get(null);
    if (unassigned && unassigned.archiveCount > 0) {
      rows.push({
        ownerId: null,
        ownerName: "Non attribué",
        archiveCount: unassigned.archiveCount,
        sizeBytes: unassigned.sizeBytes,
      });
    }
    return rows;
  }, [owners, summary]);

  const cardCount = 1 + Math.max(ownerRows.length, 1);

  return (
    <section className="dashboard-section local-archive-storage">
      <h2>Stockage archives</h2>
      {error ? (
        <p className="local-archive-storage-error" role="alert">
          {error}
        </p>
      ) : !summary ? (
        <p className="local-archive-storage-hint">Chargement…</p>
      ) : (
        <div
          className="local-archive-storage-grid"
          style={
            {
              "--archive-card-count": cardCount,
            } as CSSProperties
          }
        >
          <article className="local-archive-storage-card">
            <span className="local-archive-storage-label">Total foyer</span>
            <strong>{formatByteSize(summary.totalBytes)}</strong>
            <span className="local-archive-storage-sub">
              {summary.archiveCount} archive
              {summary.archiveCount > 1 ? "s" : ""}
            </span>
          </article>
          {ownerRows.map((row) => (
            <OwnerStorageCard
              key={row.ownerId ?? "unassigned"}
              ownerId={row.ownerId}
              ownerName={row.ownerName}
              archiveCount={row.archiveCount}
              sizeBytes={row.sizeBytes}
              tree={treesByOwner.get(row.ownerId) ?? []}
            />
          ))}
        </div>
      )}
    </section>
  );
}
