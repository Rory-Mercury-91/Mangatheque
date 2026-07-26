import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { CoverImage } from "@/components/common/CoverImage";
import { FormModalCancelButton, FormModalSaveButton } from "@/components/common/FormModalActions";
import { Modal } from "@/components/common/Modal";
import {
  adkamiRangeLength,
  applyAdkamiSeasonMapDraft,
  assignAnimeToUnitWithRangeFit,
  buildAdkamiSeasonMapDraft,
  canSplitAdkamiSeasonMapUnit,
  collectAdkamiSeasonMapWarnings,
  malEpisodeCountForRangeFit,
  removeAdkamiSeasonMapUnit,
  splitAdkamiSeasonMapUnit,
  validateAdkamiSeasonMapDraft,
  withAdkamiRange,
  type AdkamiSeasonMapDraft,
} from "@/services/adkamiSeasonMapService";
import { openExternalUrl } from "@/services/platform/linkService";
import { resolveAnimeDisplayTitle, type Anime } from "@/types/anime";
import { buildMalAnimeUrl } from "@/utils/animeExternalLinks";
import {
  getAdkamiAudioPreference,
  setAdkamiAudioPreference,
} from "@/utils/adkamiUnknownTypes";
import type {
  AdkamiAudioPreference,
} from "@/utils/adkamiUrlParts";
import type { AdkamiUnitGroupId } from "@/utils/adkamiEpisodePageParser";
import "@/features/works/WorkFormModal.css";
import "@/components/common/ghostActionBtn.css";
import "./AdkamiSeasonMapModal.css";

const UNIT_GROUPS: Array<{
  id: AdkamiUnitGroupId;
  title: string;
}> = [
  { id: "episodes", title: "Épisodes" },
  { id: "extras", title: "Digressions & spéciaux" },
  { id: "oav", title: "OAV" },
  { id: "films", title: "Films" },
];

export interface AdkamiSeasonMapModalProps {
  open: boolean;
  /** ID ou URL ADKami prérempli. */
  initialIdOrUrl?: string | null;
  /** Fiche animé de départ (suggestions franchise). */
  seedAnimeId?: string | null;
  onClose: () => void;
  onApplied?: () => void;
}

/**
 * @description Modale scrap ADKami → attribution des saisons / OAV / films aux fiches MAL locales.
 */
export function AdkamiSeasonMapModal({
  open,
  initialIdOrUrl = null,
  seedAnimeId = null,
  onClose,
  onApplied,
}: AdkamiSeasonMapModalProps) {
  const [rawInput, setRawInput] = useState("");
  const [audio, setAudio] = useState<AdkamiAudioPreference>("vostfr");
  const [draft, setDraft] = useState<AdkamiSeasonMapDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRawInput(initialIdOrUrl?.trim() || "");
    setAudio(getAdkamiAudioPreference());
    setDraft(null);
    setError(null);
    setInfo(null);
  }, [open, initialIdOrUrl]);

  const candidateOptions = useMemo(() => {
    if (!draft) return [];
    return draft.candidateAnimes.map((anime) => ({
      id: anime.id,
      label: `${resolveAnimeDisplayTitle(anime)}${
        anime.year != null ? ` (${anime.year})` : ""
      } · MAL ${anime.mal_id}${
        anime.episodes != null && anime.episodes > 0
          ? ` · ${anime.episodes} ép.`
          : ""
      }`,
    }));
  }, [draft]);

  const animeById = useMemo(() => {
    const map = new Map<string, Anime>();
    if (!draft) return map;
    for (const anime of draft.candidateAnimes) {
      map.set(anime.id, anime);
    }
    return map;
  }, [draft]);

  const unitGroups = useMemo(() => {
    if (!draft) return [];
    return UNIT_GROUPS.map((group) => ({
      ...group,
      units: draft.units.filter((unit) => unit.groupId === group.id),
    })).filter((group) => group.units.length > 0);
  }, [draft]);

  const warnings = useMemo(
    () => (draft ? collectAdkamiSeasonMapWarnings(draft) : []),
    [draft],
  );

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      setAdkamiAudioPreference(audio);
      const next = await buildAdkamiSeasonMapDraft(rawInput, {
        audioPreference: audio,
        seedAnimeId,
      });
      setDraft(next);
      setInfo(
        `ID ${next.adkamiId} · mode ${
          next.numberingMode === "continuous"
            ? "continu"
            : next.numberingMode === "reset"
              ? "reset par saison"
              : "saison unique"
        } · ${next.units.length} bloc(s)`,
      );
    } catch (err) {
      setDraft(null);
      setError(
        err instanceof Error ? err.message : "Analyse ADKami impossible.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!draft) return;
    const hardError = validateAdkamiSeasonMapDraft(draft);
    if (hardError) {
      setError(hardError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { updated } = await applyAdkamiSeasonMapDraft(draft);
      setInfo(`${updated} fiche(s) mise(s) à jour.`);
      onApplied?.();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Enregistrement impossible.",
      );
    } finally {
      setSaving(false);
    }
  };

  const patchUnit = (
    unitKey: string,
    patch: Partial<AdkamiSeasonMapDraft["units"][number]>,
  ) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        units: prev.units.map((unit) => {
          if (unit.unitKey !== unitKey) {
            if (patch.markActive === true && unit.markActive) {
              return { ...unit, markActive: false };
            }
            return unit;
          }
          return { ...unit, ...patch };
        }),
      };
    });
  };

  const patchRange = (
    unitKey: string,
    episodeFrom: number,
    episodeTo: number,
  ) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        units: prev.units.map((unit) =>
          unit.unitKey === unitKey
            ? withAdkamiRange(unit, episodeFrom, episodeTo)
            : unit,
        ),
      };
    });
  };

  const handleSelectAnime = (unitKey: string, animeId: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const anime = animeId
        ? (prev.candidateAnimes.find((a) => a.id === animeId) ?? null)
        : null;
      return {
        ...prev,
        units: assignAnimeToUnitWithRangeFit(prev.units, unitKey, anime),
      };
    });
  };

  const handleSplit = (unitKey: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        units: splitAdkamiSeasonMapUnit(prev.units, unitKey),
      };
    });
  };

  const handleRemovePart = (unitKey: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        units: removeAdkamiSeasonMapUnit(prev.units, unitKey),
      };
    });
  };

  return (
    <Modal
      open={open}
      title="Attribution saisons ADKami"
      onClose={onClose}
      wide
      footer={
        <>
          <FormModalCancelButton onClick={onClose} disabled={saving} />
          <FormModalSaveButton
            onClick={() => void handleApply()}
            disabled={!draft || loading || saving}
            saving={saving}
            title="Valider l'attribution"
            aria-label="Valider l'attribution"
          />
        </>
      }
    >
      <div className="adkami-season-map">
        <p className="adkami-season-map-hint">
          Une saison ADKami peut couvrir plusieurs fiches MAL (ex. Partie 1 /
          Partie 2) : scindez le bloc ou ajustez les plages d&apos;épisodes.
          À la sélection d&apos;une fiche, la plage est calée sur le total MAL
          si le bloc est trop long. La sauvegarde pose l&apos;ID ADKami sur
          chaque fiche.
        </p>

        <div className="adkami-season-map-toolbar">
          <label className="form-field adkami-season-map-input">
            <span>ID ou URL ADKami</span>
            <input
              type="text"
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder="3070 ou https://www.adkami.com/anime/3070"
              disabled={loading || saving}
            />
          </label>
          <label className="form-field">
            <span>Audio</span>
            <select
              value={audio}
              onChange={(e) =>
                setAudio(e.target.value === "vf" ? "vf" : "vostfr")
              }
              disabled={loading || saving}
            >
              <option value="vostfr">VOSTFR (défaut)</option>
              <option value="vf">VF</option>
            </select>
          </label>
          <button
            type="button"
            className="ghost-action-btn"
            onClick={() => void handleAnalyze()}
            disabled={loading || saving || !rawInput.trim()}
          >
            {loading ? "Analyse…" : "Analyser"}
          </button>
        </div>

        {error ? (
          <p className="adkami-season-map-error" role="alert">
            {error}
          </p>
        ) : null}
        {info ? <p className="adkami-season-map-info">{info}</p> : null}

        {draft?.unknownContentTypes.length ? (
          <p className="adkami-season-map-warn">
            Type(s) ADKami inconnu(s) détecté(s) :{" "}
            {draft.unknownContentTypes
              .map((t) => `${t.code} (« ${t.label} »)`)
              .join(", ")}
            . Signalé(s) pour classification ultérieure.
          </p>
        ) : null}

        {warnings.length > 0 ? (
          <div className="adkami-season-map-warn" role="status">
            <strong>Vérifications :</strong>
            <ul>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {draft ? (
          <div className="adkami-season-map-groups">
            {unitGroups.map((group) => (
              <section
                key={group.id}
                className="adkami-season-map-group"
                aria-label={group.title}
              >
                <h3 className="adkami-season-map-group-title">
                  {group.title}
                  <span>{group.units.length}</span>
                </h3>
                <div className="adkami-season-map-table">
                  <div
                    className="adkami-season-map-table-head"
                    aria-hidden
                  >
                    <span />
                    <span>Bloc</span>
                    <span>Plage ADKami</span>
                    <span>Fiche bibliothèque</span>
                    <span>Actions</span>
                  </div>
                  <ul className="adkami-season-map-list">
                    {group.units.map((unit) => {
                      const selected = unit.selectedAnimeId
                        ? animeById.get(unit.selectedAnimeId)
                        : null;
                      const coverTitle = selected
                        ? resolveAnimeDisplayTitle(selected)
                        : unit.contentLabel;
                      const rangeLen = adkamiRangeLength(
                        unit.episodeFrom,
                        unit.episodeTo,
                      );
                      const malEps = selected
                        ? malEpisodeCountForRangeFit(selected)
                        : null;
                      const mismatch =
                        selected &&
                        malEps != null &&
                        unit.episodeFrom > 0 &&
                        (unit.groupId === "episodes" ||
                          unit.groupId === "oav") &&
                        Math.abs(rangeLen - malEps) > 0.01;
                      const isSplitPart = unit.unitKey.includes("#part-");
                      const rowClass = [
                        "adkami-season-map-row",
                        !selected ? "adkami-season-map-row--empty" : "",
                        mismatch ? "adkami-season-map-row--warn" : "",
                      ]
                        .filter(Boolean)
                        .join(" ");

                      return (
                        <li key={unit.unitKey} className={rowClass}>
                          <div
                            className="adkami-season-map-cover"
                            aria-hidden={!selected}
                          >
                            <CoverImage
                              url={selected?.cover_url}
                              alt={coverTitle}
                              variant="tile"
                              zoomable={Boolean(selected?.cover_url)}
                            />
                          </div>

                          <div className="adkami-season-map-bloc">
                            <strong>
                              S{unit.seasonIndex}
                              <span>{unit.contentLabel}</span>
                            </strong>
                            {unit.detailLabel ? (
                              <em
                                className="adkami-season-map-detail"
                                title={unit.detailLabel}
                              >
                                {unit.detailLabel}
                              </em>
                            ) : null}
                          </div>

                          <div className="adkami-season-map-range">
                            <div className="adkami-season-map-range-fields">
                              <label className="form-field">
                                <span>De</span>
                                <input
                                  type="number"
                                  step="0.1"
                                  min={0}
                                  value={unit.episodeFrom}
                                  onChange={(e) =>
                                    patchRange(
                                      unit.unitKey,
                                      Number(e.target.value),
                                      unit.episodeTo,
                                    )
                                  }
                                  disabled={saving}
                                  aria-label={`Épisode de début S${unit.seasonIndex}`}
                                />
                              </label>
                              <span
                                className="adkami-season-map-range-sep"
                                aria-hidden
                              >
                                →
                              </span>
                              <label className="form-field">
                                <span>À</span>
                                <input
                                  type="number"
                                  step="0.1"
                                  min={0}
                                  value={unit.episodeTo}
                                  onChange={(e) =>
                                    patchRange(
                                      unit.unitKey,
                                      unit.episodeFrom,
                                      Number(e.target.value),
                                    )
                                  }
                                  disabled={saving}
                                  aria-label={`Épisode de fin S${unit.seasonIndex}`}
                                />
                              </label>
                            </div>
                            <span
                              className={`adkami-season-map-range-count${
                                mismatch
                                  ? " adkami-season-map-range-count--warn"
                                  : ""
                              }`}
                            >
                              {rangeLen} ép.
                              {malEps != null ? ` · MAL ${malEps}` : ""}
                            </span>
                          </div>

                          <div className="adkami-season-map-select-row">
                            <label className="form-field adkami-season-map-select">
                              <span className="sr-only">
                                Fiche bibliothèque
                              </span>
                              <select
                                value={unit.selectedAnimeId ?? ""}
                                onChange={(e) =>
                                  handleSelectAnime(
                                    unit.unitKey,
                                    e.target.value,
                                  )
                                }
                                disabled={saving}
                              >
                                <option value="">— Choisir —</option>
                                {candidateOptions.map((opt) => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              className="ghost-action-btn adkami-season-map-mal-btn"
                              disabled={!selected}
                              title={
                                selected
                                  ? `Ouvrir MAL ${selected.mal_id}`
                                  : "Sélectionnez une fiche pour ouvrir MAL"
                              }
                              aria-label="Ouvrir la fiche MyAnimeList"
                              onClick={() => {
                                if (!selected) return;
                                void openExternalUrl(
                                  buildMalAnimeUrl(selected.mal_id),
                                );
                              }}
                            >
                              <ExternalLink size={15} aria-hidden />
                            </button>
                          </div>

                          <div className="adkami-season-map-actions">
                            {unit.groupId === "episodes" ? (
                              <label
                                className="form-field form-field--checkbox adkami-season-map-active-check"
                                title="Saison active pour le planning"
                              >
                                <input
                                  type="checkbox"
                                  checked={unit.markActive}
                                  onChange={(e) =>
                                    patchUnit(unit.unitKey, {
                                      markActive: e.target.checked,
                                    })
                                  }
                                  disabled={saving}
                                />
                                <span>Active</span>
                              </label>
                            ) : (
                              <span className="adkami-season-map-actions-spacer" />
                            )}
                            {canSplitAdkamiSeasonMapUnit(unit) ? (
                              <button
                                type="button"
                                className="ghost-action-btn adkami-season-map-split-btn"
                                onClick={() => handleSplit(unit.unitKey)}
                                disabled={saving}
                                title="Scinder en deux plages (ex. Partie 1 / Partie 2)"
                              >
                                Scinder
                              </button>
                            ) : null}
                            {isSplitPart ? (
                              <button
                                type="button"
                                className="ghost-action-btn adkami-season-map-split-btn"
                                onClick={() => handleRemovePart(unit.unitKey)}
                                disabled={saving}
                                title="Retirer cette partie scindée"
                              >
                                Retirer
                              </button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
