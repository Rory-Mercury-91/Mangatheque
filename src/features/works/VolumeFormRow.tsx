import { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { CoverImage } from "@/components/common/CoverImage";
import { TogglePill } from "@/components/common/TogglePill";
import type { Owner } from "@/types/database";
import type { VolumeFormRow as VolumeFormRowType } from "@/types/workForm";
import "./VolumeFormRow.css";

export interface VolumeFormRowProps {
  volume: VolumeFormRowType;
  owners: Owner[];
  onChange: (patch: Partial<VolumeFormRowType>) => void;
  onRemove: () => void;
}

/**
 * @description Ligne tome dans la modale : image + métadonnées + toggles propriétaires.
 */
export function VolumeFormRow({
  volume,
  owners,
  onChange,
  onRemove,
}: VolumeFormRowProps) {
  const [expanded, setExpanded] = useState(true);
  const isMihon = volume.mihonOwnerId != null;

  const toggleOwner = (ownerId: string) => {
    if (isMihon) {
      return;
    }
    const active = volume.ownerIds.includes(ownerId);
    const next = active
      ? volume.ownerIds.filter((id) => id !== ownerId)
      : [...volume.ownerIds, ownerId];
    onChange({ ownerIds: next });
  };

  const toggleMihon = (ownerId: string) => {
    if (volume.mihonOwnerId === ownerId) {
      onChange({ mihonOwnerId: null });
      return;
    }
    onChange({ mihonOwnerId: ownerId, ownerIds: [] });
  };

  return (
    <article className="volume-form-row">
      <header className="volume-form-row-header">
        <button
          type="button"
          className="volume-form-row-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <ChevronDown
            size={16}
            className={`volume-chevron${expanded ? " volume-chevron--open" : ""}`}
          />
          Tome {volume.volumeNumber}
        </button>
        <button
          type="button"
          className="btn-icon"
          onClick={onRemove}
          aria-label={`Supprimer le tome ${volume.volumeNumber}`}
        >
          <Trash2 size={16} />
        </button>
      </header>

      {expanded && (
        <div className="volume-form-row-body">
          <div className="volume-form-row-cover">
            <CoverImage
              url={volume.coverUrl}
              alt={`Couverture tome ${volume.volumeNumber}`}
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
                  min={1}
                  value={volume.volumeNumber}
                  onChange={(e) =>
                    onChange({ volumeNumber: Number(e.target.value) || 1 })
                  }
                />
              </label>
              <label className="form-field">
                <span>Sortie</span>
                <input
                  type="date"
                  value={volume.releaseDate}
                  onChange={(e) => onChange({ releaseDate: e.target.value })}
                />
              </label>
              <label className="form-field">
                <span>Achat</span>
                <input
                  type="date"
                  value={volume.purchaseDate}
                  onChange={(e) => onChange({ purchaseDate: e.target.value })}
                  disabled={isMihon}
                />
              </label>
              <label className="form-field">
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
                  <option value="classic">Classique</option>
                  <option value="collector">Collector</option>
                </select>
              </label>
            </div>

            <div className="volume-owners-line">
              <span className="volume-owners-label">Achat physique</span>
              <div className="toggle-pill-group">
                {owners.map((owner) => (
                  <TogglePill
                    key={owner.id}
                    label={owner.name}
                    color={owner.color}
                    active={volume.ownerIds.includes(owner.id)}
                    disabled={isMihon}
                    onClick={() => toggleOwner(owner.id)}
                  />
                ))}
              </div>
            </div>

            <div className="volume-owners-line">
              <span className="volume-owners-label">Mihon</span>
              <div className="toggle-pill-group">
                {owners.map((owner) => (
                  <TogglePill
                    key={`mihon-${owner.id}`}
                    label={owner.name}
                    color={owner.color}
                    active={volume.mihonOwnerId === owner.id}
                    onClick={() => toggleMihon(owner.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
