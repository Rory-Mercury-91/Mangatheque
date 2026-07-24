import { useCallback, useEffect, useRef, useState } from "react";
import { CoverImage } from "@/components/common/CoverImage";
import { resolveBestAnimeCoverUrl } from "@/services/anilistCoverService";
import "./AnimeMediaCarousel.css";

export interface AnimeCarouselCard {
  key: string;
  title: string;
  image?: string | null;
  /** MAL ID pour upgrade cover AniList. */
  malId?: number;
  /** Type média pour AniList (défaut animé). */
  mediaKind?: "anime" | "manga";
  chip?: string | null;
  inLibrary: boolean;
  localHref?: string;
  votesTooltip?: string;
  onAdd?: () => void;
  onOpenLocal?: () => void;
}

export interface AnimeMediaCarouselProps {
  items: AnimeCarouselCard[];
  emptyLabel: string;
}

/**
 * @description Carrousel horizontal (relations / recommandations).
 */
export function AnimeMediaCarousel({
  items,
  emptyLabel,
}: AnimeMediaCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);
  const [resolvedImages, setResolvedImages] = useState<Record<string, string>>(
    {},
  );

  const updateScrollability = useCallback(() => {
    const track = trackRef.current;
    if (!track) {
      setCanScroll(false);
      return;
    }
    setCanScroll(track.scrollWidth > track.clientWidth + 4);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const entries = await Promise.all(
        items.map(async (item) => {
          if (item.malId == null) {
            return [item.key, item.image?.trim() || ""] as const;
          }
          const url = await resolveBestAnimeCoverUrl({
            malId: item.malId,
            mediaType: item.mediaKind === "manga" ? "MANGA" : "ANIME",
            fallbackUrl: item.image,
          });
          return [item.key, url?.trim() || ""] as const;
        }),
      );

      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [key, url] of entries) {
        if (url) next[key] = url;
      }
      setResolvedImages(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    updateScrollability();
    const observer = new ResizeObserver(() => updateScrollability());
    observer.observe(track);
    window.addEventListener("resize", updateScrollability);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScrollability);
    };
  }, [items, resolvedImages, updateScrollability]);

  if (items.length === 0) {
    return <p className="anime-carousel-empty">{emptyLabel}</p>;
  }

  const scrollByDir = (dir: number) => {
    trackRef.current?.scrollBy({ left: dir * 176, behavior: "smooth" });
  };

  return (
    <div className={`anime-carousel${canScroll ? "" : " anime-carousel--plain"}`}>
      {canScroll ? (
        <button
          type="button"
          className="anime-carousel-nav"
          aria-label="Précédent"
          onClick={() => scrollByDir(-1)}
        >
          ‹
        </button>
      ) : null}
      <div className="anime-carousel-track" ref={trackRef}>
        {items.map((item) => {
          const image = resolvedImages[item.key] || item.image;

          return (
            <article
              key={item.key}
              className="anime-carousel-card"
              title={item.votesTooltip || undefined}
            >
              {image ? (
                <div className="anime-carousel-cover">
                  <CoverImage
                    url={image}
                    alt={item.title}
                    variant="tile"
                    zoomable
                  />
                </div>
              ) : (
                <div className="anime-carousel-cover">
                  <div className="anime-carousel-cover-fallback">
                    Pas d’image
                  </div>
                </div>
              )}
              <div className="anime-carousel-body">
                {item.chip ? (
                  <span className="anime-carousel-chip">{item.chip}</span>
                ) : null}
                {item.inLibrary && item.onOpenLocal ? (
                  <button
                    type="button"
                    className="anime-carousel-title-btn"
                    onClick={item.onOpenLocal}
                  >
                    <strong>{item.title}</strong>
                  </button>
                ) : (
                  <strong>{item.title}</strong>
                )}
                <div className="anime-carousel-actions">
                  {item.inLibrary ? (
                    <span className="anime-pill-local">
                      Dans la bibliothèque
                    </span>
                  ) : item.onAdd ? (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={item.onAdd}
                    >
                      Ajouter
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {canScroll ? (
        <button
          type="button"
          className="anime-carousel-nav"
          aria-label="Suivant"
          onClick={() => scrollByDir(1)}
        >
          ›
        </button>
      ) : null}
    </div>
  );
}
