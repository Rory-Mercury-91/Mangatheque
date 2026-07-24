import { useEffect, useState } from "react";
import {
  FormModalCancelButton,
  FormModalSaveButton,
} from "@/components/common/FormModalActions";
import { Modal } from "@/components/common/Modal";
import {
  AnimeStreamingEditor,
  type AnimeStreamingLinkDraft,
} from "@/features/anime/AnimeStreamingEditor";
import { patchAnimeStreaming } from "@/services/animeService";
import type { AnimeStreamingEntry } from "@/types/anime";
import "@/features/works/WorkFormModal.css";

type AnimeStreamingModalProps = {
  open: boolean;
  animeId: string;
  initialStreaming: AnimeStreamingEntry[];
  onClose: () => void;
  onSaved: (streaming: AnimeStreamingEntry[]) => void;
};

/**
 * @description Modale d’édition des liens streaming d’un animé.
 */
export function AnimeStreamingModal({
  open,
  animeId,
  initialStreaming,
  onClose,
  onSaved,
}: AnimeStreamingModalProps) {
  const [draft, setDraft] = useState<AnimeStreamingLinkDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDraft(
      initialStreaming.map((entry) => ({
        name: entry.name,
        url: entry.url,
      })),
    );
  }, [open, initialStreaming]);

  const handleSave = async () => {
    const cleaned = draft
      .map((row) => ({
        name: row.name.trim(),
        url: row.url.trim(),
      }))
      .filter((row) => row.name && row.url);

    for (const row of cleaned) {
      try {
        // Validation légère d’URL
        void new URL(row.url);
      } catch {
        setError(`URL invalide pour « ${row.name} ».`);
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      await patchAnimeStreaming(animeId, cleaned);
      onSaved(cleaned);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Enregistrement impossible.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Liens streaming"
      onClose={onClose}
      wide
      footer={
        <div className="form-actions">
          <FormModalCancelButton onClick={onClose} disabled={saving} />
          <FormModalSaveButton
            saving={saving}
            disabled={saving}
            onClick={() => void handleSave()}
          />
        </div>
      }
    >
      {error ? <p className="form-error">{error}</p> : null}
      <AnimeStreamingEditor
        value={draft}
        onChange={setDraft}
        disabled={saving}
      />
    </Modal>
  );
}
