import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { CoverImage } from "@/components/common/CoverImage";
import { FormModalCancelButton, FormModalSaveButton } from "@/components/common/FormModalActions";
import { Modal } from "@/components/common/Modal";
import { AnimeMalPicker } from "@/features/anime/AnimeMalPicker";
import { AnimeStreamingEditor } from "@/features/anime/AnimeStreamingEditor";
import {
  ANIME_AIRING_STATUS_OPTIONS,
  ANIME_MEDIA_TYPE_LABELS,
  ANIME_NSFW_LABELS,
  ANIME_RATING_OPTIONS,
  ANIME_SEASON_LABELS,
  ANIME_SOURCE_LABELS,
  ANIME_SOURCE_OPTIONS,
  deriveAnimeNsfwFromRating,
  formatAnimeSourceLabel,
  normalizeAnimeAiringStatus,
  normalizeAnimeNsfw,
  normalizeAnimeRating,
  normalizeAnimeSourceKey,
  type AnimeNsfwLevel,
} from "@/constants/animeStatus";
import {
  createEmptyAnimeFormValues,
  type AnimeFormValues,
} from "@/types/animeForm";
import { parseAdkamiUrl } from "@/utils/animeExternalLinks";
import {
  animeToFormValues,
  buildAnimeFormFromMalId,
  createAnime,
  fetchAnimeById,
  updateAnime,
} from "@/services/animeService";
import { requestSupabaseDataReload } from "@/services/supabaseSyncHub";
import "@/components/common/ghostActionBtn.css";
import "@/features/works/WorkFormModal.css";
import "./AnimeFormModal.css";

export interface AnimeFormModalProps {
  open: boolean;
  animeId?: string | null;
  /** Préremplissage (ex. depuis une relation MAL). */
  initialMalId?: number | null;
  onClose: () => void;
  onSaved?: (animeId: string) => void;
}

/**
 * @description Modale création / édition d'un animé (titre FR inclus).
 */
export function AnimeFormModal({
  open,
  animeId = null,
  initialMalId = null,
  onClose,
  onSaved,
}: AnimeFormModalProps) {
  const [form, setForm] = useState<AnimeFormValues>(createEmptyAnimeFormValues());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const isEdit = Boolean(animeId);

  useEffect(() => {
    if (!open) return;
    setError(null);
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        if (animeId) {
          const anime = await fetchAnimeById(animeId);
          if (!anime) throw new Error("Animé introuvable.");
          const values = animeToFormValues(anime);
          if (!cancelled) setForm(values);
        } else if (initialMalId != null) {
          const values = await buildAnimeFormFromMalId(initialMalId);
          if (!cancelled) setForm(values);
        } else {
          if (!cancelled) setForm(createEmptyAnimeFormValues());
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Chargement impossible.");
          setForm(createEmptyAnimeFormValues());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, animeId, initialMalId]);

  const patch = <K extends keyof AnimeFormValues>(
    key: K,
    value: AnimeFormValues[K],
  ) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "rating") {
        // Suit la classification dans les deux sens (hausse et baisse).
        next.nsfw = deriveAnimeNsfwFromRating(String(value ?? ""));
      }
      return next;
    });
  };

  const handleImportMal = async (malId: number) => {
    setPickerOpen(false);
    setImporting(true);
    setError(null);
    try {
      setForm(await buildAnimeFormFromMalId(malId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import MAL impossible.");
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = isEdit && animeId
        ? await updateAnime(animeId, form)
        : await createAnime(form);
      requestSupabaseDataReload();
      onSaved?.(saved.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const tagInput = (key: "genres" | "themes" | "demographics" | "studios", label: string) => (
    <label className="form-field form-field--full">
      <span>{label}</span>
      <input
        type="text"
        value={form[key].join(", ")}
        onChange={(e) =>
          patch(
            key,
            e.target.value
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean),
          )
        }
        placeholder="Séparer par des virgules"
      />
    </label>
  );

  return (
    <>
      <Modal
        open={open}
        title={isEdit ? "Modifier l'animé" : "Ajouter un animé"}
        onClose={onClose}
        wide
        footer={
          <>
            <div className="form-actions">
              <FormModalCancelButton onClick={onClose} />
              <FormModalSaveButton
                onClick={() => void handleSave()}
                disabled={saving || loading || importing}
                saving={saving}
              />
            </div>
          </>
        }
      >
        {loading || importing ? (
          <p>Chargement…</p>
        ) : (
          <div className="work-form work-form--modal">
            {error ? <p className="form-error">{error}</p> : null}

            <div className="work-general-layout work-general-layout--anime">
              <div className="work-cover-block">
                <CoverImage
                  url={form.coverUrl}
                  alt={form.title || "Couverture"}
                  variant="fill"
                  zoomable
                />
                <label className="form-field">
                  <span>Couverture (URL)</span>
                  <input
                    type="url"
                    value={form.coverUrl}
                    onChange={(e) => patch("coverUrl", e.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span className="anime-form-mal-label">
                    <span>MAL ID</span>
                    <button
                      type="button"
                      className="ghost-action-btn anime-form-mal-search-btn"
                      title="Rechercher sur MyAnimeList"
                      aria-label="Rechercher sur MyAnimeList"
                      onClick={() => setPickerOpen(true)}
                    >
                      <Search size={15} aria-hidden />
                    </button>
                  </span>
                  <input
                    type="number"
                    value={form.malId ?? ""}
                    onChange={(e) =>
                      patch(
                        "malId",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                </label>
                <label className="form-field">
                  <span>ADKami ID ou URL</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={
                      form.adkamiId != null ? String(form.adkamiId) : ""
                    }
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (!raw) {
                        patch("adkamiId", null);
                        patch("adkamiSection", "anime");
                        return;
                      }
                      const parsed = parseAdkamiUrl(raw);
                      if (parsed) {
                        patch("adkamiId", parsed.adkamiId);
                        patch("adkamiSection", parsed.section);
                        return;
                      }
                      if (/^\d+$/.test(raw)) {
                        patch("adkamiId", Number(raw));
                      }
                    }}
                    placeholder="2267 ou URL ADKami"
                  />
                </label>
                <label className="form-field">
                  <span>Section ADKami</span>
                  <select
                    value={form.adkamiSection || "anime"}
                    onChange={(e) => patch("adkamiSection", e.target.value)}
                    disabled={form.adkamiId == null}
                  >
                    <option value="anime">anime</option>
                    <option value="hentai">hentai</option>
                    <option value="drama">drama</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>URL Nautiljon</span>
                  <input
                    type="url"
                    value={form.sourceUrl}
                    onChange={(e) => patch("sourceUrl", e.target.value)}
                    placeholder="https://www.nautiljon.com/animes/…"
                  />
                </label>
              </div>

              <div className="form-grid">
                <label className="form-field form-field--full">
                  <span>Titre</span>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => patch("title", e.target.value)}
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Titre FR</span>
                  <input
                    type="text"
                    value={form.titleFr}
                    onChange={(e) => patch("titleFr", e.target.value)}
                    placeholder="Affiché en priorité sur la fiche"
                  />
                </label>
                <label className="form-field">
                  <span>Titre EN</span>
                  <input
                    type="text"
                    value={form.titleEn}
                    onChange={(e) => patch("titleEn", e.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span>Titre JA</span>
                  <input
                    type="text"
                    value={form.titleJa}
                    onChange={(e) => patch("titleJa", e.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span>Type</span>
                  <select
                    value={form.mediaType}
                    onChange={(e) => patch("mediaType", e.target.value)}
                  >
                    {Object.entries(ANIME_MEDIA_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Source</span>
                  <select
                    value={(() => {
                      const key = normalizeAnimeSourceKey(form.source);
                      if (!key) return "";
                      if (ANIME_SOURCE_LABELS[key]) return key;
                      return `__custom__:${form.source}`;
                    })()}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v.startsWith("__custom__:")) {
                        patch("source", v.slice("__custom__:".length));
                        return;
                      }
                      patch("source", v);
                    }}
                  >
                    {ANIME_SOURCE_OPTIONS.map((option) => (
                      <option key={option.value || "empty"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                    {form.source &&
                    !ANIME_SOURCE_LABELS[normalizeAnimeSourceKey(form.source)] ? (
                      <option value={`__custom__:${form.source}`}>
                        {formatAnimeSourceLabel(form.source) ?? form.source}
                      </option>
                    ) : null}
                  </select>
                </label>
                <label className="form-field">
                  <span>Statut diffusion</span>
                  <select
                    value={
                      normalizeAnimeAiringStatus(form.status) ??
                      "finished_airing"
                    }
                    onChange={(e) => patch("status", e.target.value)}
                  >
                    {ANIME_AIRING_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Saison</span>
                  <select
                    value={form.season}
                    onChange={(e) => patch("season", e.target.value)}
                  >
                    <option value="">—</option>
                    {Object.entries(ANIME_SEASON_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Année</span>
                  <input
                    type="number"
                    value={form.year ?? ""}
                    onChange={(e) =>
                      patch(
                        "year",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Épisodes</span>
                  <input
                    type="number"
                    min={0}
                    value={form.episodes ?? ""}
                    onChange={(e) =>
                      patch(
                        "episodes",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Durée (secondes)</span>
                  <input
                    type="number"
                    min={0}
                    value={form.durationSeconds ?? ""}
                    onChange={(e) =>
                      patch(
                        "durationSeconds",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Classification</span>
                  <select
                    value={normalizeAnimeRating(form.rating) ?? ""}
                    onChange={(e) => patch("rating", e.target.value)}
                  >
                    <option value="">—</option>
                    {ANIME_RATING_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>NSFW</span>
                  <select
                    value={normalizeAnimeNsfw(form.nsfw)}
                    onChange={(e) =>
                      patch("nsfw", e.target.value as AnimeNsfwLevel)
                    }
                  >
                    {(Object.keys(ANIME_NSFW_LABELS) as AnimeNsfwLevel[]).map(
                      (key) => (
                        <option key={key} value={key}>
                          {ANIME_NSFW_LABELS[key]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                {tagInput("studios", "Studios")}
                {tagInput("genres", "Genres")}
                {tagInput("themes", "Thèmes")}
                {tagInput("demographics", "Démographie")}
                <div className="form-field form-field--full">
                  <span>Streaming</span>
                  <AnimeStreamingEditor
                    value={form.streaming}
                    onChange={(streaming) => patch("streaming", streaming)}
                    disabled={saving || loading || importing}
                  />
                </div>
                <label className="form-field form-field--full">
                  <span>Synopsis</span>
                  <textarea
                    rows={5}
                    value={form.synopsis}
                    onChange={(e) => patch("synopsis", e.target.value)}
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <AnimeMalPicker
        open={pickerOpen}
        initialQuery={form.title}
        onClose={() => setPickerOpen(false)}
        onSelect={(malId) => void handleImportMal(malId)}
      />
    </>
  );
}
