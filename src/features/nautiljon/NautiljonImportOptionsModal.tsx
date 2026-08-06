import { useEffect, useState } from "react";
import {
  FormModalCancelButton,
  FormModalSaveButton,
} from "@/components/common/FormModalActions";
import { Modal } from "@/components/common/Modal";
import type { Owner, ScrapePayloadV1 } from "@/types/database";
import {
  suggestNautiljonImportOptions,
  type NautiljonImportOptions,
  type NautiljonImportTrackingKind,
} from "@/utils/nautiljonImportOptions";
import "./NautiljonImportOptionsModal.css";

export interface NautiljonImportOptionsModalProps {
  open: boolean;
  payload: ScrapePayloadV1 | null;
  /** Propriétaires du foyer (Mihon / achat). */
  owners?: Owner[];
  onClose: () => void;
  onConfirm: (options: NautiljonImportOptions) => void;
  /** Progression enrichissement fiches tome (hors écran). */
  enrichProgress?: { current: number; total: number; label: string } | null;
}

/**
 * @description Choix d'import après navigation Nautiljon (suivi, compteurs, propriétaires).
 */
export function NautiljonImportOptionsModal({
  open,
  payload,
  onClose,
  onConfirm,
  enrichProgress = null,
}: NautiljonImportOptionsModalProps) {
  const [tracking, setTracking] =
    useState<NautiljonImportTrackingKind>("chapter");
  const [includeVolumeList, setIncludeVolumeList] = useState(false);
  const [chaptersVf, setChaptersVf] = useState("");
  const [chaptersVo, setChaptersVo] = useState("");

  useEffect(() => {
    if (!open || !payload) return;
    const suggested = suggestNautiljonImportOptions(payload);
    setTracking(suggested.tracking);
    setIncludeVolumeList(suggested.includeVolumeList);
    setChaptersVf(
      suggested.chaptersVfCount != null ? String(suggested.chaptersVfCount) : "",
    );
    setChaptersVo(
      suggested.chaptersVoTotal != null ? String(suggested.chaptersVoTotal) : "",
    );
  }, [open, payload]);

  if (!payload) return null;

  const volumeCount = payload.volumes?.length ?? 0;
  const vf = payload.volumesVfCount;
  const vo = payload.volumesVoTotal;

  const parseCount = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  };

  const buildOptions = (): NautiljonImportOptions => {
    return {
      tracking,
      includeVolumeList: tracking === "volume" ? includeVolumeList : false,
      chaptersVfCount: tracking === "chapter" ? parseCount(chaptersVf) : null,
      chaptersVoTotal: tracking === "chapter" ? parseCount(chaptersVo) : null,
      mihonOwnerName: null,
      ownerNames: [],
    };
  };

  const busy = enrichProgress != null;

  return (
    <Modal
      open={open}
      title="Import Nautiljon"
      onClose={busy ? () => undefined : onClose}
      stacked
      floating
      footer={
        <div className="form-actions">
          <FormModalCancelButton onClick={onClose} disabled={busy} />
          <FormModalSaveButton
            title="Appliquer"
            aria-label="Appliquer l'import Nautiljon"
            disabled={busy}
            onClick={() => onConfirm(buildOptions())}
          />
        </div>
      }
    >
      <div className="nautiljon-import-opts">
        {busy ? (
          <div
            className="nautiljon-import-opts-progress"
            role="status"
            aria-live="polite"
          >
            <p>
              Récupération des fiches tome en arrière-plan…
              <br />
              <strong>{enrichProgress.label}</strong>
            </p>
            <div
              className="nautiljon-import-opts-progress-bar"
              aria-hidden
            >
              <span
                style={{
                  width: `${Math.round(
                    (enrichProgress.current / Math.max(1, enrichProgress.total)) *
                      100,
                  )}%`,
                }}
              />
            </div>
          </div>
        ) : null}
        <p className="nautiljon-import-opts-lead">
          Fiche : <strong>{payload.title}</strong>
          {payload.demographicType ? (
            <span className="nautiljon-import-opts-meta">
              {" "}
              · {payload.demographicType}
            </span>
          ) : null}
          {vf != null || vo != null ? (
            <span className="nautiljon-import-opts-meta">
              {" "}
              · tomes VF {vf ?? "—"} / VO {vo ?? "—"}
              {volumeCount > 0 ? ` · ${volumeCount} liens` : ""}
            </span>
          ) : null}
        </p>

        {(payload.genres?.length || payload.themes?.length) ? (
          <p className="nautiljon-import-opts-tags">
            {payload.genres?.length ? (
              <>
                <strong>Genres</strong> : {payload.genres.join(", ")}
              </>
            ) : null}
            {payload.genres?.length && payload.themes?.length ? <br /> : null}
            {payload.themes?.length ? (
              <>
                <strong>Thèmes</strong> : {payload.themes.join(", ")}
              </>
            ) : null}
          </p>
        ) : null}

        <fieldset className="nautiljon-import-opts-fieldset">
          <legend>Type de suivi</legend>
          <label className="nautiljon-import-opts-choice">
            <input
              type="radio"
              name="nautiljon-tracking"
              checked={tracking === "chapter"}
              onChange={() => {
                setTracking("chapter");
                setIncludeVolumeList(false);
              }}
            />
            <span>
              <strong>Version chapitres</strong>
              <small>Scan / webtoon — métadonnées + compteurs chapitres.</small>
            </span>
          </label>
          <label className="nautiljon-import-opts-choice">
            <input
              type="radio"
              name="nautiljon-tracking"
              checked={tracking === "volume"}
              onChange={() => setTracking("volume")}
            />
            <span>
              <strong>Version tomes</strong>
              <small>Suivi par tomes (édition papier VF quand disponible).</small>
            </span>
          </label>
        </fieldset>

        {tracking === "chapter" ? (
          <div className="nautiljon-import-opts-counts">
            <label className="form-field">
              <span>Chapitres VF</span>
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder="ex. 120"
                value={chaptersVf}
                onChange={(e) => setChaptersVf(e.target.value)}
              />
            </label>
            <label className="form-field">
              <span>Chapitres VO</span>
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder="ex. 140"
                value={chaptersVo}
                onChange={(e) => setChaptersVo(e.target.value)}
              />
            </label>
            <p className="nautiljon-import-opts-hint">
              Pour un manga en scan, saisissez ici les totaux (souvent absents de
              Nautiljon).
            </p>
          </div>
        ) : (
          <label className="nautiljon-import-opts-check">
            <input
              type="checkbox"
              checked={includeVolumeList}
              onChange={(e) => setIncludeVolumeList(e.target.checked)}
              disabled={volumeCount === 0}
            />
            <span>
              Inclure la liste des tomes
              {volumeCount > 0 ? ` (${volumeCount})` : " (aucun lien détecté)"}
              {vf != null && vf > 0 ? " — limitée au compteur VF" : ""}
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}
