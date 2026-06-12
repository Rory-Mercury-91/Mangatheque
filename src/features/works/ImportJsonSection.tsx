import { useId, useRef, useState } from "react";
import { FileJson, Loader2 } from "lucide-react";
import { scrapePayloadJsonToFormValues } from "@/services/importJsonService";
import type { WorkFormValues } from "@/types/workForm";
import "./ImportJsonSection.css";

export interface ImportJsonSectionProps {
  onApply: (values: WorkFormValues) => void;
}

/**
 * @description Zone d'import JSON Nautiljon (mobile / Firefox Tampermonkey).
 */
export function ImportJsonSection({ onApply }: ImportJsonSectionProps) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function applyJson(text: string) {
    setError(null);
    setLoading(true);
    try {
      const values = scrapePayloadJsonToFormValues(text);
      onApply(values);
      setRaw("");
      setOpen(false);
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

      {open ? (
        <div className="import-json-panel">
          <p className="import-json-hint">
            Sur mobile : exportez le JSON depuis Nautiljon avec le script
            Tampermonkey, puis collez-le ici ou choisissez le fichier
            téléchargé.
          </p>
          <label className="import-json-field" htmlFor={`${fileInputId}-textarea`}>
            <span>Données JSON</span>
            <textarea
              id={`${fileInputId}-textarea`}
              rows={6}
              value={raw}
              placeholder='{"schemaVersion":1,"title":"…",…}'
              onChange={(event) => setRaw(event.target.value)}
            />
          </label>
          {error ? <p className="import-json-error">{error}</p> : null}
          <div className="import-json-actions">
            <input
              ref={fileInputRef}
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
      ) : null}
    </section>
  );
}
