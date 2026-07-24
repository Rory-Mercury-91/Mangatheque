import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { translateText } from "@/services/googleTranslateService";
import {
  cleanSynopsisSource,
  looksLikeFrench,
} from "@/utils/synopsisText";

type UseSynopsisTranslationOptions = {
  synopsis: string | null | undefined;
  /** Lance une traduction auto si le texte ne semble pas français. */
  autoTranslate?: boolean;
  /** Persiste le texte nettoyé / traduit (BDD). */
  onPersist?: (text: string) => Promise<void>;
};

/**
 * @description Gère nettoyage MAL Rewrite, autotraduction et action manuelle.
 */
export function useSynopsisTranslation({
  synopsis,
  autoTranslate = false,
  onPersist,
}: UseSynopsisTranslationOptions) {
  const cleaned = useMemo(() => cleanSynopsisSource(synopsis), [synopsis]);
  const [displayText, setDisplayText] = useState(cleaned);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoKeyRef = useRef<string | null>(null);
  const translatingRef = useRef(false);
  const persistRef = useRef(onPersist);
  persistRef.current = onPersist;

  useEffect(() => {
    setDisplayText(cleaned);
    setError(null);
  }, [cleaned]);

  const persistIfChanged = useCallback(
    async (next: string) => {
      const original = (synopsis ?? "").trim();
      if (!next || next === original) return;
      await persistRef.current?.(next);
    },
    [synopsis],
  );

  const translate = useCallback(async () => {
    if (!cleaned || translatingRef.current) return;
    translatingRef.current = true;
    setTranslating(true);
    setError(null);
    try {
      const translated = await translateText(cleaned, "auto", "fr");
      setDisplayText(translated);
      await persistIfChanged(translated);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Traduction impossible.";
      setError(message);
      console.error("[traduction]", err);
    } finally {
      translatingRef.current = false;
      setTranslating(false);
    }
  }, [cleaned, persistIfChanged]);

  useEffect(() => {
    if (!cleaned) return;

    const needsCleanPersist =
      cleaned !== (synopsis ?? "").trim() && Boolean(persistRef.current);

    if (looksLikeFrench(cleaned)) {
      if (needsCleanPersist) {
        void persistIfChanged(cleaned).catch((err) => {
          console.error("[traduction] Persistance nettoyage :", err);
        });
      }
      return;
    }

    if (!autoTranslate) return;
    if (autoKeyRef.current === cleaned) return;
    autoKeyRef.current = cleaned;
    void translate();
  }, [autoTranslate, cleaned, persistIfChanged, synopsis, translate]);

  return {
    displayText,
    translating,
    error,
    translate,
    canTranslate: Boolean(cleaned),
  };
}
