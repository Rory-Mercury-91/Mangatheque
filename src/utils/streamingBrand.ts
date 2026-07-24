import adnLogo from "@/assets/streaming/adn.png";
import crunchyrollLogo from "@/assets/streaming/crunchyroll.png";
import netflixLogo from "@/assets/streaming/netflix.png";
import primeVideoLogo from "@/assets/streaming/prime-video.png";
import youtubeLogo from "@/assets/streaming/youtube.png";

export type StreamingBrandId =
  | "adn"
  | "crunchyroll"
  | "netflix"
  | "prime_video"
  | "youtube";

export interface StreamingBrandVisual {
  id: StreamingBrandId;
  logoSrc: string;
  label: string;
}

/**
 * @description Détecte la marque streaming depuis le nom ou l'URL.
 */
export function resolveStreamingBrand(
  name: string,
  url: string,
): StreamingBrandVisual | null {
  const hay = `${name} ${url}`.toLowerCase();

  if (hay.includes("crunchyroll") || hay.includes("crunchyroll.com")) {
    return {
      id: "crunchyroll",
      logoSrc: crunchyrollLogo,
      label: "Crunchyroll",
    };
  }

  if (
    hay.includes("animation digital network") ||
    /\badn\b/.test(hay) ||
    hay.includes("animationdigitalnetwork") ||
    hay.includes("animedigitalnetwork") ||
    hay.includes("adn.tv") ||
    hay.includes("adn.fr")
  ) {
    return {
      id: "adn",
      logoSrc: adnLogo,
      label: "ADN",
    };
  }

  if (hay.includes("netflix") || hay.includes("netflix.com")) {
    return {
      id: "netflix",
      logoSrc: netflixLogo,
      label: "Netflix",
    };
  }

  if (
    hay.includes("prime video") ||
    hay.includes("amazon prime") ||
    hay.includes("primevideo") ||
    hay.includes("primevideo.com")
  ) {
    return {
      id: "prime_video",
      logoSrc: primeVideoLogo,
      label: "Prime Video",
    };
  }

  if (
    hay.includes("youtube") ||
    hay.includes("youtu.be") ||
    hay.includes("youtube.com")
  ) {
    return {
      id: "youtube",
      logoSrc: youtubeLogo,
      label: "YouTube",
    };
  }

  return null;
}

/** Presets pour l’éditeur de liens streaming. */
export const STREAMING_BRAND_PRESETS: Array<{
  name: string;
  urlPrefix: string;
  logoSrc: string;
  brandId: StreamingBrandId;
}> = [
  {
    name: "Crunchyroll",
    urlPrefix: "https://www.crunchyroll.com/",
    logoSrc: crunchyrollLogo,
    brandId: "crunchyroll",
  },
  {
    name: "ADN",
    urlPrefix: "https://animationdigitalnetwork.com/",
    logoSrc: adnLogo,
    brandId: "adn",
  },
  {
    name: "Netflix",
    urlPrefix: "https://www.netflix.com/",
    logoSrc: netflixLogo,
    brandId: "netflix",
  },
  {
    name: "Prime Video",
    urlPrefix: "https://www.primevideo.com/",
    logoSrc: primeVideoLogo,
    brandId: "prime_video",
  },
  {
    name: "YouTube",
    urlPrefix: "https://www.youtube.com/",
    logoSrc: youtubeLogo,
    brandId: "youtube",
  },
];
