import { useEffect, useMemo, useState } from "react";
import { ImageLightbox } from "@/components/common/ImageLightbox";
import {
  NO_COVER_PLACEHOLDER,
  resolveCoverImageUrl,
} from "@/lib/imageProxy";
import "./CoverImage.css";

export type CoverImageVariant = "natural" | "tile" | "fill";

export interface CoverImageGalleryItem {
  url: string;
  alt: string;
}

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
  /**
   * Galerie partagée : flèches gauche/droite en plein écran.
   * `galleryIndex` = index de cette image dans la galerie.
   */
  gallery?: CoverImageGalleryItem[];
  galleryIndex?: number;
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
  gallery,
  galleryIndex = 0,
}: CoverImageProps) {
  const [src, setSrc] = useState(NO_COVER_PLACEHOLDER);
  const [failed, setFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(galleryIndex);
  const [gallerySrcs, setGallerySrcs] = useState<string[]>([]);

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

  useEffect(() => {
    if (!gallery?.length) {
      setGallerySrcs([]);
      return;
    }
    let cancelled = false;
    void Promise.all(
      gallery.map((item) => resolveCoverImageUrl(item.url)),
    ).then((resolved) => {
      if (!cancelled) {
        setGallerySrcs(
          resolved.map((value) => value || NO_COVER_PLACEHOLDER),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [gallery]);

  const displaySrc = failed ? NO_COVER_PLACEHOLDER : src;
  const canZoom =
    zoomable &&
    Boolean(url?.trim()) &&
    !failed &&
    displaySrc !== NO_COVER_PLACEHOLDER;

  const lightboxItems = useMemo(() => {
    if (!gallery?.length || gallerySrcs.length !== gallery.length) {
      return undefined;
    }
    return gallery.map((item, index) => ({
      src: gallerySrcs[index] || NO_COVER_PLACEHOLDER,
      alt: item.alt,
    }));
  }, [gallery, gallerySrcs]);

  return (
    <>
      <img
        className={`cover-image cover-image--${variant}${canZoom ? " cover-image--zoomable" : ""} ${className}`.trim()}
        src={displaySrc}
        alt={alt}
        loading={loading}
        decoding="async"
        onError={() => setFailed(true)}
        onClick={
          canZoom
            ? () => {
                setLightboxIndex(galleryIndex);
                setLightboxOpen(true);
              }
            : undefined
        }
        onKeyDown={
          canZoom
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setLightboxIndex(galleryIndex);
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
          items={lightboxItems}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </>
  );
}
