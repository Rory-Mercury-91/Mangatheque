import { Plus, Trash2 } from "lucide-react";
import {
  resolveStreamingBrand,
  STREAMING_BRAND_PRESETS,
} from "@/utils/streamingBrand";
import "@/components/common/ghostActionBtn.css";
import "./AnimeStreamingEditor.css";

export type AnimeStreamingLinkDraft = {
  name: string;
  url: string;
};

type AnimeStreamingEditorProps = {
  value: AnimeStreamingLinkDraft[];
  onChange: (next: AnimeStreamingLinkDraft[]) => void;
  disabled?: boolean;
};

const CUSTOM_VALUE = "__custom__";

/**
 * @description Éditeur de liens streaming (plateforme + URL + logo).
 */
export function AnimeStreamingEditor({
  value,
  onChange,
  disabled = false,
}: AnimeStreamingEditorProps) {
  const updateRow = (index: number, patch: Partial<AnimeStreamingLinkDraft>) => {
    onChange(
      value.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const removeRow = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const addRow = () => {
    const first = STREAMING_BRAND_PRESETS[0];
    onChange([
      ...value,
      {
        name: first?.name ?? "",
        url: first?.urlPrefix ?? "",
      },
    ]);
  };

  return (
    <div className="anime-streaming-editor">
      {value.length === 0 ? (
        <p className="anime-streaming-editor-empty">
          Aucun lien streaming. Ajoutez ADN, Crunchyroll, Netflix…
        </p>
      ) : null}

      {value.map((row, index) => {
        const presetMatch = STREAMING_BRAND_PRESETS.find(
          (p) => p.name.toLowerCase() === row.name.trim().toLowerCase(),
        );
        const selectValue = presetMatch ? presetMatch.name : CUSTOM_VALUE;
        const resolved =
          presetMatch == null
            ? resolveStreamingBrand(row.name, row.url)
            : null;
        const logoSrc = presetMatch?.logoSrc ?? resolved?.logoSrc ?? null;
        const logoId = presetMatch?.brandId ?? resolved?.id ?? null;
        const logoLabel = presetMatch?.name ?? resolved?.label ?? row.name;

        return (
          <div key={`stream-${index}`} className="anime-streaming-editor-row">
            <div className="anime-streaming-editor-platform">
              <label className="form-field anime-streaming-editor-select">
                <span>Plateforme</span>
                <select
                  value={selectValue}
                  disabled={disabled}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next === CUSTOM_VALUE) {
                      updateRow(index, {
                        name: presetMatch ? "" : row.name,
                      });
                      return;
                    }
                    const preset = STREAMING_BRAND_PRESETS.find(
                      (p) => p.name === next,
                    );
                    updateRow(index, {
                      name: next,
                      url: row.url.trim() || preset?.urlPrefix || row.url,
                    });
                  }}
                >
                  {STREAMING_BRAND_PRESETS.map((preset) => (
                    <option key={preset.name} value={preset.name}>
                      {preset.name}
                    </option>
                  ))}
                  <option value={CUSTOM_VALUE}>Autre…</option>
                </select>
              </label>

              {logoSrc && logoId ? (
                <div
                  className={`anime-streaming-editor-logo anime-streaming-editor-logo--${logoId}`}
                  title={logoLabel}
                >
                  <img src={logoSrc} alt="" aria-hidden />
                </div>
              ) : (
                <div
                  className="anime-streaming-editor-logo anime-streaming-editor-logo--empty"
                  aria-hidden
                />
              )}
            </div>

            {selectValue === CUSTOM_VALUE ? (
              <label className="form-field">
                <span>Nom</span>
                <input
                  type="text"
                  value={row.name}
                  disabled={disabled}
                  placeholder="ex. Disney+"
                  onChange={(e) => updateRow(index, { name: e.target.value })}
                />
              </label>
            ) : null}

            <label className="form-field anime-streaming-editor-url">
              <span>URL</span>
              <div className="form-field-row">
                <input
                  type="url"
                  value={row.url}
                  disabled={disabled}
                  placeholder="https://…"
                  onChange={(e) => updateRow(index, { url: e.target.value })}
                />
                <button
                  type="button"
                  className="ghost-action-btn ghost-action-btn--danger"
                  title="Supprimer ce lien"
                  aria-label="Supprimer ce lien streaming"
                  disabled={disabled}
                  onClick={() => removeRow(index)}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            </label>
          </div>
        );
      })}

      <div className="anime-streaming-editor-actions">
        <button
          type="button"
          className="ghost-action-btn"
          disabled={disabled}
          onClick={addRow}
          title="Ajouter un lien streaming"
          aria-label="Ajouter un lien streaming"
        >
          <Plus size={16} aria-hidden />
          <span className="ghost-action-label">Ajouter un lien</span>
        </button>
      </div>
    </div>
  );
}
