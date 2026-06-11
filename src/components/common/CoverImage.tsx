import { useEffect, useState } from "react";
import { ImageLightbox } from "@/components/common/ImageLightbox";
import {
  NO_COVER_PLACEHOLDER,
  resolveCoverImageUrl,
} from "@/lib/imageProxy";
import "./CoverImage.css";

export interface CoverImageProps {
  url: string | null | undefined;
  alt: string;
  className?: string;
  /** @default false — ouvre la couverture en plein écran au clic */
  zoomable?: boolean;
}

/**
 * @description Affiche une couverture avec proxy Nautiljon, repli visuel et zoom optionnel.
 */
export function CoverImage({
  url,
  alt,
  className = "",
  zoomable = false,
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
        className={`cover-image${canZoom ? " cover-image--zoomable" : ""} ${className}`.trim()}
        src={displaySrc}
        alt={alt}
        loading="lazy"
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
