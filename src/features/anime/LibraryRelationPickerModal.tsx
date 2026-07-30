import { useEffect, useMemo, useState } from "react";
import { CoverImage } from "@/components/common/CoverImage";
import { Modal } from "@/components/common/Modal";
import {
  ANIME_RELATION_LABELS,
  formatAnimeRelationLabel,
} from "@/constants/animeStatus";
import { matchesNormalizedSearch } from "@/utils/textNormalize";
import "./LibraryRelationPickerModal.css";

export interface LibraryRelationPickerItem {
  id: string;
  title: string;
  coverUrl?: string | null;
  subtitle?: string | null;
  /** Données renvoyées à la sélection. */
  payload: unknown;
}

export interface LibraryRelationPickerModalProps {
  open: boolean;
  title: string;
  items: LibraryRelationPickerItem[];
  emptyLabel?: string;
  /** Préremplit la recherche (ex. titre de la fiche courante). */
  initialQuery?: string;
  /** Relation MAL proposée (adaptation par défaut). */
  defaultRelation?: string;
  /**
   * Affiche le sélecteur de type de relation (défaut true).
   * Désactiver pour une simple sélection de fiche (ex. fusion).
   */
  showRelationSelect?: boolean;
  onClose: () => void;
  onSelect: (payload: unknown, relation: string) => void | Promise<void>;
}

const RELATION_OPTIONS = [
  "adaptation",
  "sequel",
  "prequel",
  "side_story",
  "parent_story",
  "spin_off",
  "alternative_version",
  "alternative_setting",
  "character",
  "other",
];

/**
 * @description Modale de sélection d'une fiche locale (manga ou animé) pour lier une relation.
 */
export function LibraryRelationPickerModal({
  open,
  title,
  items,
  emptyLabel = "Aucune fiche disponible.",
  initialQuery = "",
  defaultRelation = "adaptation",
  showRelationSelect = true,
  onClose,
  onSelect,
}: LibraryRelationPickerModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [relation, setRelation] = useState(defaultRelation);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setRelation(defaultRelation);
    setBusyId(null);
  }, [open, initialQuery, defaultRelation]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return items;
    return items.filter((item) =>
      matchesNormalizedSearch([item.title, item.subtitle], q),
    );
  }, [items, query]);

  const handlePick = async (item: LibraryRelationPickerItem) => {
    if (busyId) return;
    setBusyId(item.id);
    try {
      await onSelect(item.payload, relation);
      onClose();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="relation-picker">
        {showRelationSelect ? (
          <label className="form-field">
            <span>Type de relation</span>
            <select
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
            >
              {RELATION_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {ANIME_RELATION_LABELS[key] ?? formatAnimeRelationLabel(key)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="relation-picker-empty" style={{ marginBottom: "0.75rem" }}>
            La fiche actuelle sera conservée. L&apos;autre sera absorbée puis
            supprimée.
          </p>
        )}
        <label className="form-field">
          <span>Rechercher</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Titre…"
            autoFocus
          />
        </label>
        {filtered.length === 0 ? (
          <p className="relation-picker-empty">{emptyLabel}</p>
        ) : (
          <ul className="relation-picker-list">
            {filtered.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="relation-picker-item"
                  disabled={busyId != null}
                  onClick={() => void handlePick(item)}
                >
                  <div className="relation-picker-cover">
                    <CoverImage
                      url={item.coverUrl}
                      alt={item.title}
                      variant="tile"
                    />
                  </div>
                  <span className="relation-picker-meta">
                    <strong>{item.title}</strong>
                    {item.subtitle ? <small>{item.subtitle}</small> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
