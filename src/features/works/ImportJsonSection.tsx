import { useId, useState } from "react";
import { FileJson, Loader2 } from "lucide-react";
import { scrapePayloadJsonToFormValues } from "@/services/importJsonService";
import type { Owner } from "@/types/database";
import type { WorkFormValues } from "@/types/workForm";
import "./ImportJsonSection.css";

export interface ImportJsonSectionProps {
  onApply: (values: WorkFormValues) => void;
  owners?: Owner[];
}

/**
 * @description Bouton d'import JSON Nautiljon — charge le fichier et applique immédiatement.
 */
export function ImportJsonSection({
  onApply,
  owners = [],
}: ImportJsonSectionProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputId = useId();

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const text = await file.text();
      const values = scrapePayloadJsonToFormValues(text, owners);
      onApply(values);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de lire le fichier JSON.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="import-json-toolbar">
      <input
        id={fileInputId}
        type="file"
        accept=".json,application/json"
        className="import-json-file-input"
        disabled={loading}
        onChange={(event) => void handleFileChange(event)}
      />
      <label
        htmlFor={fileInputId}
        className={`btn-secondary btn-sm import-json-btn${loading ? " import-json-btn--loading" : ""}`}
        title="Importer un export JSON Nautiljon (.json)"
      >
        {loading ? (
          <Loader2 size={14} className="spin" aria-hidden />
        ) : (
          <FileJson size={14} aria-hidden />
        )}
        Importer .json
      </label>
      {error ? (
        <p className="import-json-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
