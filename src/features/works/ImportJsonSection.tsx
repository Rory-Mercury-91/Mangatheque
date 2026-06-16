import { useId, useState } from "react";
import { FileJson, Loader2 } from "lucide-react";
import { scrapePayloadJsonToFormValues } from "@/services/importJsonService";
import type { Owner } from "@/types/database";
import type { WorkFormValues } from "@/types/workForm";
import "./ImportJsonSection.css";

export interface ImportJsonSectionProps {
  onApply: (values: WorkFormValues) => void;
  owners?: Owner[];
  /** Layout mobile intégré dans une section réductible (sans toggle, texte condensé). */
  compactMobile?: boolean;
}

/**
 * @description Zone d'import JSON Nautiljon (mobile / Firefox Tampermonkey).
 */
export function ImportJsonSection({
  onApply,
  owners = [],
  compactMobile = false,
}: ImportJsonSectionProps) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputId = useId();

  function applyJson(text: string) {
    setError(null);
    setLoading(true);
    try {
      const values = scrapePayloadJsonToFormValues(text, owners);
      onApply(values);
      setRaw("");
      if (!compactMobile) {
        setOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import JSON impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setError(null);
    try {
      const text = await file.text();
      setRaw(text);
      applyJson(text);
    } catch {
      setError("Impossible de lire le fichier JSON.");
    }
  }

  const panel = (
    <div className={`import-json-panel${compactMobile ? " import-json-panel--compact" : ""}`}>
      {!compactMobile ? (
        <p className="import-json-hint">
          Collez le JSON exporté depuis Nautiljon, puis cliquez sur Appliquer.
        </p>
      ) : (
        <p className="import-json-hint">
          Collez le JSON (appui long → Coller) ou ouvrez un fichier téléchargé, puis Appliquer.
        </p>
      )}
      <label className="import-json-field" htmlFor={`${fileInputId}-textarea`}>
        {!compactMobile ? <span>Données JSON</span> : null}
        <textarea
          id={`${fileInputId}-textarea`}
          rows={compactMobile ? 4 : 6}
          value={raw}
          placeholder='{"schemaVersion":1,"title":"…",…}'
          onChange={(event) => setRaw(event.target.value)}
        />
      </label>
      {error ? <p className="import-json-error">{error}</p> : null}
      <div className="import-json-actions">
        <input
          id={fileInputId}
          type="file"
          accept=".json,application/json"
          className="import-json-file-input"
          onChange={(event) => void handleFileChange(event)}
        />
        <label htmlFor={fileInputId} className="btn-secondary btn-sm">
          Fichier .json
        </label>
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={loading || !raw.trim()}
          onClick={() => applyJson(raw)}
        >
          {loading ? (
            <>
              <Loader2 size={14} className="spin" aria-hidden />
              Import…
            </>
          ) : (
            "Appliquer"
          )}
        </button>
      </div>
    </div>
  );

  if (compactMobile) {
    return <div className="import-json-section import-json-section--embedded">{panel}</div>;
  }

  return (
    <section className="import-json-section">
      <button
        type="button"
        className="import-json-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <FileJson size={16} aria-hidden />
        Importer depuis JSON (Nautiljon)
      </button>
      {open ? panel : null}
    </section>
  );
}
