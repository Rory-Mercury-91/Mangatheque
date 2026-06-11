import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Palette } from "lucide-react";
import { OwnerBadgeLegend } from "@/components/common/OwnerBadgeLegend";
import { OwnerInitialBadge } from "@/components/common/OwnerInitialBadge";
import { useOwners } from "@/hooks/useOwners";
import { updateOwnerProfile } from "@/services/ownerService";
import type { Owner } from "@/types/database";
import { getOwnerBadgeText, getOwnerInitial } from "@/utils/ownerDisplay";
import "./PersonalizationPage.css";

type OwnerDraft = {
  color: string;
  badgeLabel: string;
};

function toDraft(owner: Owner): OwnerDraft {
  return {
    color: owner.color,
    badgeLabel: owner.badge_label ?? "",
  };
}

/**
 * @description Personnalisation des pastilles propriétaire (couleur et texte).
 */
export function PersonalizationPage() {
  const { owners, loading, error, reload } = useOwners();
  const [drafts, setDrafts] = useState<Record<string, OwnerDraft>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const next: Record<string, OwnerDraft> = {};
    for (const owner of owners) {
      next[owner.id] = toDraft(owner);
    }
    setDrafts(next);
  }, [owners]);

  function patchDraft(ownerId: string, patch: Partial<OwnerDraft>) {
    setDrafts((current) => ({
      ...current,
      [ownerId]: { ...current[ownerId], ...patch },
    }));
    setSaved(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await Promise.all(
        owners.map((owner) => {
          const draft = drafts[owner.id];
          if (!draft) {
            return Promise.resolve();
          }
          const badgeLabel = draft.badgeLabel.trim() || null;
          const hasColorChange = draft.color !== owner.color;
          const hasLabelChange = badgeLabel !== (owner.badge_label ?? null);
          if (!hasColorChange && !hasLabelChange) {
            return Promise.resolve();
          }
          return updateOwnerProfile(owner.id, {
            color: draft.color,
            badgeLabel,
          });
        }),
      );
      await reload();
      setSaved(true);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Erreur à l'enregistrement.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="personalization-page">
      <header className="personalization-header">
        <Palette size={26} aria-hidden />
        <div>
          <h1>Personnalisation</h1>
          <p className="personalization-subtitle">
            Couleur et texte des pastilles sur les tomes (achat et Mihon).
          </p>
        </div>
      </header>

      {loading ? (
        <p className="personalization-status">
          <Loader2 size={18} className="spin" aria-hidden />
          Chargement…
        </p>
      ) : error ? (
        <p className="personalization-error">{error}</p>
      ) : (
        <form className="personalization-form" onSubmit={handleSubmit}>
          <OwnerBadgeLegend
            sampleOwner={
              owners[0]
                ? {
                    name: owners[0].name,
                    color: owners[0].color,
                    badge_label: owners[0].badge_label,
                  }
                : undefined
            }
          />
          <ul className="personalization-list">
            {owners.map((owner) => {
              const draft = drafts[owner.id] ?? toDraft(owner);
              const previewOwner = {
                name: owner.name,
                color: draft.color,
                badge_label: draft.badgeLabel.trim() || null,
              };
              const defaultInitial = getOwnerInitial(owner.name);

              return (
                <li key={owner.id} className="personalization-card">
                  <div className="personalization-card-head">
                    <strong>{owner.name}</strong>
                    <div className="personalization-preview">
                      <OwnerInitialBadge owner={previewOwner} variant="purchase" />
                      <OwnerInitialBadge owner={previewOwner} variant="mihon" />
                    </div>
                  </div>

                  <label className="personalization-field">
                    <span>Couleur de la pastille</span>
                    <div className="personalization-color-row">
                      <input
                        type="color"
                        value={draft.color}
                        onChange={(e) =>
                          patchDraft(owner.id, { color: e.target.value })
                        }
                      />
                      <input
                        type="text"
                        value={draft.color}
                        onChange={(e) =>
                          patchDraft(owner.id, { color: e.target.value })
                        }
                        pattern="^#[0-9A-Fa-f]{6}$"
                        maxLength={7}
                        aria-label={`Couleur hexadécimale pour ${owner.name}`}
                      />
                    </div>
                  </label>

                  <label className="personalization-field">
                    <span>
                      Texte de la pastille{" "}
                      <small>(vide = initiale « {defaultInitial} »)</small>
                    </span>
                    <input
                      type="text"
                      value={draft.badgeLabel}
                      maxLength={4}
                      placeholder={defaultInitial}
                      onChange={(e) =>
                        patchDraft(owner.id, { badgeLabel: e.target.value })
                      }
                    />
                    <small className="personalization-hint">
                      Aperçu achat : {getOwnerBadgeText(previewOwner)}
                    </small>
                  </label>
                </li>
              );
            })}
          </ul>

          {saveError ? <p className="personalization-error">{saveError}</p> : null}
          {saved ? (
            <p className="personalization-success" role="status">
              Personnalisation enregistrée.
            </p>
          ) : null}

          <div className="personalization-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
