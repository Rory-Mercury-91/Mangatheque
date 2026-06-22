import { useState } from "react";
import { ChevronDown, CopyPlus, Trash2 } from "lucide-react";
import { CoverImage } from "@/components/common/CoverImage";
import { FlexibleDateInput } from "@/components/common/FlexibleDateInput";
import { OwnerOwnershipPill } from "@/components/common/OwnerOwnershipPill";
import { ToggleSwitch } from "@/components/common/ToggleSwitch";
import { useTouchTabletLayout } from "@/hooks/useTouchTabletLayout";
import { isMobileRuntime } from "@/lib/platform";
import type { Owner, TrackingUnit } from "@/types/database";
import type { VolumeFormRow as VolumeFormRowType } from "@/types/workForm";
import { formatVolumeTitle } from "@/utils/volumeDisplay";
import { parseVolumeNumberInput } from "@/utils/volumeNumber";
import "./VolumeFormRow.css";

export interface VolumeFormRowProps {
  volume: VolumeFormRowType;
  owners: Owner[];
  trackingUnit?: TrackingUnit;
  /** Prix par défaut de la série (placeholder si le tome n'a pas de prix propre). */
  defaultPrice?: number | null;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onChange: (patch: Partial<VolumeFormRowType>) => void;
  onRemove?: () => void;
  /** @default true */
  removable?: boolean;
  /** Libellé du bouton de duplication vers l'autre édition. */
  duplicateEditionLabel?: string;
  /** Copie les infos du tome et bascule Simple ↔ Collector. */
  onDuplicateEdition?: () => void;
  duplicateEditionDisabled?: boolean;
}

/**
 * @description Ligne tome dans la modale : image + métadonnées + toggles propriétaires.
 */
export function VolumeFormRow({
  volume,
  owners,
  trackingUnit = "volume",
  defaultPrice = null,
  expanded: controlledExpanded,
  defaultExpanded = true,
  onExpandedChange,
  onChange,
  onRemove,
  removable = true,
  duplicateEditionLabel,
  onDuplicateEdition,
  duplicateEditionDisabled = false,
}: VolumeFormRowProps) {
  const touchTabletLayout = useTouchTabletLayout(isMobileRuntime());
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : internalExpanded;

  const toggleExpanded = () => {
    const next = !expanded;
    if (!isControlled) {
      setInternalExpanded(next);
    }
    onExpandedChange?.(next);
  };
  const toggleOwner = (ownerId: string) => {
    const active = volume.ownerIds.includes(ownerId);
    if (active) {
      const nextOwnerIds = volume.ownerIds.filter((id) => id !== ownerId);
      onChange({
        ownerIds: nextOwnerIds,
        sharedPurchase:
          nextOwnerIds.length >= 2 ? volume.sharedPurchase : true,
      });
      return;
    }
    const nextOwnerIds = [...volume.ownerIds, ownerId];
    onChange({
      ownerIds: nextOwnerIds,
      sharedPurchase: nextOwnerIds.length >= 2 ? true : volume.sharedPurchase,
    });
  };

  const toggleMihon = (ownerId: string) => {
    if (volume.mihonOwnerId === ownerId) {
      onChange({ mihonOwnerId: null });
      return;
    }
    onChange({ mihonOwnerId: ownerId });
  };

  const volumeTitle = formatVolumeTitle(
    volume.volumeNumber,
    volume.volumeLabel,
    trackingUnit,
  );

  return (
    <article className="volume-form-row">
      <header className="volume-form-row-header">
        <button
          type="button"
          className="volume-form-row-toggle"
          onClick={toggleExpanded}
          aria-expanded={expanded}
        >
          <ChevronDown
            size={16}
            className={`volume-chevron${expanded ? " volume-chevron--open" : ""}`}
          />
          {volumeTitle}
        </button>
        {removable && onRemove ? (
          <button
            type="button"
            className="btn-icon"
            onClick={onRemove}
            aria-label={`Supprimer ${volumeTitle}`}
          >
            <Trash2 size={16} />
          </button>
        ) : null}
      </header>

      {expanded && (
        <div className="volume-form-row-body">
          <div className="volume-form-row-cover">
            <CoverImage
              url={volume.coverUrl}
              alt={`Couverture ${volumeTitle}`}
              className="volume-cover-preview"
            />
            <label className="form-field">
              <span>URL couverture</span>
              <input
                value={volume.coverUrl}
                onChange={(e) => onChange({ coverUrl: e.target.value })}
                placeholder="https://…"
              />
            </label>
          </div>

          <div className="volume-form-row-fields">
            <div className="volume-meta-line">
              <label className="form-field">
                <span>N°</span>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={volume.volumeNumber ?? ""}
                  placeholder="—"
                  title="Ex. 1, 2 ou 1.5 pour un intercalaire"
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    onChange({
                      volumeNumber: raw === "" ? null : parseVolumeNumberInput(raw),
                    });
                  }}
                />
              </label>
              <label className="form-field volume-label-field">
                <span>Hors série</span>
                <input
                  type="text"
                  value={volume.volumeLabel ?? ""}
                  onChange={(e) =>
                    onChange({ volumeLabel: e.target.value.trim() || undefined })
                  }
                  placeholder="Ex. Official Guide Book"
                />
              </label>
              <label className="form-field">
                <span>Sortie</span>
                <FlexibleDateInput
                  value={volume.releaseDate}
                  onChange={(releaseDate) => onChange({ releaseDate })}
                />
              </label>
              <label className="form-field">
                <span>Prix (€)</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={volume.catalogPrice ?? ""}
                  placeholder={
                    defaultPrice != null && defaultPrice > 0
                      ? String(defaultPrice)
                      : "Prix série"
                  }
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (raw === "") {
                      onChange({ catalogPrice: null });
                      return;
                    }
                    const parsed = Number(raw.replace(",", "."));
                    onChange({
                      catalogPrice: Number.isFinite(parsed) ? parsed : null,
                    });
                  }}
                />
              </label>
            </div>

            <div className="volume-secondary-line">
              <label className="form-field volume-edition-field">
                <span>Édition</span>
                <select
                  value={volume.editionType}
                  onChange={(e) =>
                    onChange({
                      editionType: e.target
                        .value as VolumeFormRowType["editionType"],
                    })
                  }
                >
                  <option value="classic">Simple</option>
                  <option value="collector">Collector</option>
                </select>
              </label>
              {onDuplicateEdition && duplicateEditionLabel ? (
                <button
                  type="button"
                  className="volume-duplicate-edition-btn"
                  disabled={duplicateEditionDisabled}
                  title={duplicateEditionLabel}
                  onClick={onDuplicateEdition}
                >
                  <CopyPlus size={15} aria-hidden />
                  {duplicateEditionLabel}
                </button>
              ) : null}
            </div>

            <div
              className={[
                "volume-owners-pair",
                touchTabletLayout ? "volume-owners-pair--tablet" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="volume-owners-line volume-owners-line--purchase">
                <span className="volume-owners-label">Achat physique</span>
                <div className="volume-owners-line-main">
                  <div className="toggle-pill-group">
                    {owners.map((owner) => (
                      <OwnerOwnershipPill
                        key={owner.id}
                        owner={owner}
                        variant="purchase"
                        active={volume.ownerIds.includes(owner.id)}
                        onClick={() => toggleOwner(owner.id)}
                      />
                    ))}
                  </div>
                  {volume.ownerIds.length >= 2 ? (
                    <ToggleSwitch
                      label="Partagé"
                      checked={volume.sharedPurchase}
                      title={
                        volume.sharedPurchase
                          ? "Coût du tome divisé entre les acheteurs"
                          : "Chaque acheteur paie le prix plein du tome"
                      }
                      onChange={(checked) =>
                        onChange({ sharedPurchase: checked })
                      }
                    />
                  ) : null}
                </div>
              </div>

              <div className="volume-owners-line volume-owners-line--mihon">
                <span className="volume-owners-label">Mihon</span>
                <div className="toggle-pill-group">
                  {owners.map((owner) => (
                    <OwnerOwnershipPill
                      key={`mihon-${owner.id}`}
                      owner={owner}
                      variant="mihon"
                      mihonNameOnly
                      active={volume.mihonOwnerId === owner.id}
                      onClick={() => toggleMihon(owner.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
