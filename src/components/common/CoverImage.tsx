import { useState } from "react";
import { NO_COVER_PLACEHOLDER, proxyCoverImage } from "@/lib/imageProxy";
import "./CoverImage.css";

export interface CoverImageProps {
  url: string | null | undefined;
  alt: string;
  className?: string;
}

/**
 * @description Affiche une couverture avec proxy Nautiljon et repli visuel.
 */
export function CoverImage({ url, alt, className = "" }: CoverImageProps) {
  const [failed, setFailed] = useState(false);
  const src = failed ? NO_COVER_PLACEHOLDER : proxyCoverImage(url) || NO_COVER_PLACEHOLDER;

  return (
    <img
      className={`cover-image ${className}`.trim()}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
