import { useEffect, useState } from "react";
import { ImageLightbox } from "@/components/common/ImageLightbox";
import {
  NO_COVER_PLACEHOLDER,
  resolveCoverImageUrl,
} from "@/lib/imageProxy";
import "./CoverImage.css";

export type CoverImageVariant = "natural" | "tile" | "fill";

export interface CoverImageProps {
  url: string | null | undefined;
  alt: string;
  className?: string;
  /**
   * @default natural — proportions natives (fiche détail).
   * tile : cadre 2:3 uniforme (bibliothèque, tomes).
   * fill : cadre fixe formulaires.
   */
  variant?: CoverImageVariant;
  /** @default false — ouvre la couverture en plein écran au clic */
  zoomable?: boolean;
  /** @default lazy — eager pour préchargement hors écran */
  loading?: "lazy" | "eager";
}

/**
 * @description Affiche une couverture avec proxy Nautiljon, repli visuel et zoom optionnel.
 */
export function CoverImage({
  url,
  alt,
  className = "",
  variant = "natural",
  zoomable = false,
  loading = "lazy",
}: CoverImageProps) {
  const [src, setSrc] = useState(NO_COVER_PLACEHOLDER);
  const [failed, setFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    void resolveCoverImageUrl(url).then((resolved) => {
      if (!cancelled) {
        setSrc(resolved || NO_COVER_PLACEHOLDER);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  const displaySrc = failed ? NO_COVER_PLACEHOLDER : src;
  const canZoom =
    zoomable &&
    Boolean(url?.trim()) &&
    !failed &&
    displaySrc !== NO_COVER_PLACEHOLDER;

  return (
    <>
      <img
        className={`cover-image cover-image--${variant}${canZoom ? " cover-image--zoomable" : ""} ${className}`.trim()}
        src={displaySrc}
        alt={alt}
        loading={loading}
        decoding="async"
        onError={() => setFailed(true)}
        onClick={canZoom ? () => setLightboxOpen(true) : undefined}
        onKeyDown={
          canZoom
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setLightboxOpen(true);
                }
              }
            : undefined
        }
        role={canZoom ? "button" : undefined}
        tabIndex={canZoom ? 0 : undefined}
        title={canZoom ? "Voir en plein écran" : undefined}
      />
      {canZoom ? (
        <ImageLightbox
          open={lightboxOpen}
          src={displaySrc}
          alt={alt}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </>
  );
}
