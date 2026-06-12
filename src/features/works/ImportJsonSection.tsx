import { useId, useRef, useState } from "react";
import { ClipboardPaste, FileJson, Loader2 } from "lucide-react";
import { readClipboardText } from "@/services/platform/clipboardService";
import { scrapePayloadJsonToFormValues } from "@/services/importJsonService";
import type { WorkFormValues } from "@/types/workForm";
import "./ImportJsonSection.css";

export interface ImportJsonSectionProps {
  onApply: (values: WorkFormValues) => void;
  /** Layout mobile intégré dans une section réductible (sans toggle ni fichier). */
  compactMobile?: boolean;
}

/**
 * @description Zone d'import JSON Nautiljon (mobile / Firefox Tampermonkey).
 */
export function ImportJsonSection({
  onApply,
  compactMobile = false,
}: ImportJsonSectionProps) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function applyJson(text: string) {
    setError(null);
    setLoading(true);
    try {
      const values = scrapePayloadJsonToFormValues(text);
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

  async function handlePasteFromClipboard() {
    setError(null);
    try {
      const text = await readClipboardText();
      if (!text.trim()) {
        setError("Le presse-papiers est vide.");
        return;
      }
      setRaw(text);
      applyJson(text);
    } catch {
      textareaRef.current?.focus();
      setError(
        compactMobile
          ? "Collez dans le champ (appui long → Coller), ou réessayez le bouton."
          : "Impossible de lire le presse-papiers. Collez manuellement dans le champ.",
      );
    }
  }

  function handleTextareaPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const text = event.clipboardData.getData("text/plain");
    if (!text.trim()) {
      return;
    }
    event.preventDefault();
    setRaw(text);
    if (compactMobile) {
      applyJson(text);
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
          Sur mobile : exportez le JSON depuis Nautiljon (copié dans le
          presse-papiers), puis appuyez sur Coller ci-dessous.
        </p>
      ) : null}
      <label className="import-json-field" htmlFor={`${fileInputId}-textarea`}>
        {!compactMobile ? <span>Données JSON</span> : null}
        <textarea
          ref={textareaRef}
          id={`${fileInputId}-textarea`}
          rows={compactMobile ? 4 : 6}
          value={raw}
          placeholder='{"schemaVersion":1,"title":"…",…}'
          onChange={(event) => setRaw(event.target.value)}
          onPaste={handleTextareaPaste}
        />
      </label>
      {error ? <p className="import-json-error">{error}</p> : null}
      <div className="import-json-actions">
        {!compactMobile ? (
          <input
            id={fileInputId}
            type="file"
            accept=".json,application/json"
            className="import-json-file-input"
            onChange={(event) => void handleFileChange(event)}
          />
        ) : null}
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={loading}
          onClick={() => void handlePasteFromClipboard()}
        >
          <ClipboardPaste size={14} aria-hidden />
          Coller
        </button>
        {!compactMobile ? (
          <label htmlFor={fileInputId} className="btn-secondary btn-sm">
            Fichier .json
          </label>
        ) : null}
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
