import { useEffect, useMemo, useState } from "react";
import { CoverImage } from "@/components/common/CoverImage";
import { ImageLightbox } from "@/components/common/ImageLightbox";
import {
  NO_COVER_PLACEHOLDER,
  resolveCoverImageUrl,
} from "@/lib/imageProxy";
import type { AnimePicture } from "@/types/anime";

export interface AnimeImageGalleryProps {
  pictures: AnimePicture[];
  title: string;
}

/**
 * @description Galerie d'images animé avec zoom plein écran navigable.
 */
export function AnimeImageGallery({ pictures, title }: AnimeImageGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [resolvedSrcs, setResolvedSrcs] = useState<string[]>([]);

  const urls = useMemo(
    () =>
      pictures
        .map((pic) => pic.large ?? pic.medium ?? null)
        .filter((url): url is string => Boolean(url?.trim())),
    [pictures],
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all(urls.map((url) => resolveCoverImageUrl(url))).then(
      (resolved) => {
        if (!cancelled) {
          setResolvedSrcs(
            resolved.map((value) => value || NO_COVER_PLACEHOLDER),
          );
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [urls]);

  const lightboxItems = useMemo(
    () =>
      urls.map((url, index) => ({
        src: resolvedSrcs[index] || url,
        alt: `${title} — image ${index + 1}`,
      })),
    [urls, resolvedSrcs, title],
  );

  if (urls.length === 0) {
    return null;
  }

  return (
    <section className="work-detail-section">
      <h2>Galerie</h2>
      <div className="anime-gallery">
        {urls.map((url, index) => (
          <button
            key={`${url}-${index}`}
            type="button"
            className="anime-gallery-thumb-btn"
            title="Voir en plein écran"
            aria-label={`Voir l'image ${index + 1} en plein écran`}
            onClick={() => {
              setLightboxIndex(index);
              setLightboxOpen(true);
            }}
          >
            <CoverImage
              url={url}
              alt={`${title} — image ${index + 1}`}
              variant="tile"
            />
          </button>
        ))}
      </div>
      <ImageLightbox
        open={lightboxOpen}
        items={lightboxItems}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </section>
  );
}
