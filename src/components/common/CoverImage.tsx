import { useState } from "react";
import { ImageLightbox } from "@/components/common/ImageLightbox";
import { NO_COVER_PLACEHOLDER, proxyCoverImage } from "@/lib/imageProxy";
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
  const [failed, setFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const src = failed ? NO_COVER_PLACEHOLDER : proxyCoverImage(url) || NO_COVER_PLACEHOLDER;
  const canZoom =
    zoomable && Boolean(url?.trim()) && !failed && src !== NO_COVER_PLACEHOLDER;

  return (
    <>
      <img
        className={`cover-image${canZoom ? " cover-image--zoomable" : ""} ${className}`.trim()}
        src={src}
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
          src={src}
          alt={alt}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </>
  );
}
