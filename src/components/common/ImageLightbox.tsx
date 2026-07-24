import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import "./ImageLightbox.css";

export interface ImageLightboxItem {
  src: string;
  alt: string;
}

export interface ImageLightboxProps {
  open: boolean;
  /** Image unique (mode simple). */
  src?: string;
  alt?: string;
  /** Galerie multi-images (prioritaire sur src/alt). */
  items?: ImageLightboxItem[];
  /** Index courant dans `items` (contrôlé). */
  index?: number;
  onIndexChange?: (index: number) => void;
  onClose: () => void;
}

/**
 * @description Affiche une image en plein écran (portail body), avec navigation optionnelle.
 */
export function ImageLightbox({
  open,
  src,
  alt = "",
  items,
  index = 0,
  onIndexChange,
  onClose,
}: ImageLightboxProps) {
  const gallery = items && items.length > 0 ? items : null;
  const safeIndex =
    gallery != null
      ? Math.min(Math.max(0, index), gallery.length - 1)
      : 0;
  const current = gallery
    ? gallery[safeIndex]
    : src
      ? { src, alt }
      : null;
  const canNavigate = Boolean(gallery && gallery.length > 1);

  const goPrev = useCallback(() => {
    if (!gallery || gallery.length < 2 || !onIndexChange) return;
    onIndexChange((safeIndex - 1 + gallery.length) % gallery.length);
  }, [gallery, onIndexChange, safeIndex]);

  const goNext = useCallback(() => {
    if (!gallery || gallery.length < 2 || !onIndexChange) return;
    onIndexChange((safeIndex + 1) % gallery.length);
  }, [gallery, onIndexChange, safeIndex]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (!canNavigate) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, canNavigate, goPrev, goNext]);

  if (!open || !current?.src || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="image-lightbox-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={current.alt || "Image en plein écran"}
      onClick={onClose}
    >
      <button
        type="button"
        className="image-lightbox-close"
        onClick={onClose}
        aria-label="Fermer"
      >
        <X size={22} aria-hidden />
      </button>

      {canNavigate ? (
        <button
          type="button"
          className="image-lightbox-nav image-lightbox-nav--prev"
          onClick={(event) => {
            event.stopPropagation();
            goPrev();
          }}
          aria-label="Image précédente"
        >
          <ChevronLeft size={28} aria-hidden />
        </button>
      ) : null}

      <div
        className="image-lightbox-stage"
        onClick={(event) => event.stopPropagation()}
      >
        <img
          className="image-lightbox-img"
          src={current.src}
          alt={current.alt}
        />
        {gallery && gallery.length > 1 ? (
          <p className="image-lightbox-counter" aria-live="polite">
            {safeIndex + 1} / {gallery.length}
          </p>
        ) : null}
      </div>

      {canNavigate ? (
        <button
          type="button"
          className="image-lightbox-nav image-lightbox-nav--next"
          onClick={(event) => {
            event.stopPropagation();
            goNext();
          }}
          aria-label="Image suivante"
        >
          <ChevronRight size={28} aria-hidden />
        </button>
      ) : null}
    </div>,
    document.body,
  );
}
