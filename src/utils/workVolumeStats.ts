import type { PriceFormat } from "@/types/database";
import type { VolumeFormRow } from "@/types/workForm";
import { isChapterSeriesPlaceholder } from "@/utils/chapterSeries";
import { formatTrackingUnitCount } from "@/utils/volumeDisplay";
import type { WorkTrackingProfile } from "@/utils/workTracking";
import { formatCurrency } from "@/utils/ownerDisplay";

type VolumeStatsInput = Pick<
  VolumeFormRow,
  "volumeNumber" | "volumeLabel" | "editionType" | "catalogPrice"
>;

type VolumeCategory = "simple" | "collector" | "special";

const CATEGORY_ORDER: VolumeCategory[] = ["simple", "collector", "special"];

const CATEGORY_LABELS: Record<VolumeCategory, string> = {
  simple: "Simple",
  collector: "Collector",
  special: "Spécial",
};

function formatPriceFormatLabel(priceFormat: PriceFormat): string {
  return priceFormat === "broche" ? "Broché" : "Numérique";
}

function classifyVolumeCategory(volume: VolumeStatsInput): VolumeCategory {
  if (volume.volumeLabel?.trim()) {
    return "special";
  }
  if (volume.editionType === "collector") {
    return "collector";
  }
  return "simple";
}

function effectiveCatalogPrice(
  volume: VolumeStatsInput,
  defaultPrice: number | null,
): number | null {
  const price = volume.catalogPrice ?? defaultPrice;
  return price != null && price > 0 ? price : null;
}

function groupVolumesByCategoryAndPrice(
  volumes: VolumeStatsInput[],
  defaultPrice: number | null,
): Array<{ category: VolumeCategory; count: number; price: number | null }> {
  const groups = new Map<
    string,
    { category: VolumeCategory; count: number; price: number | null }
  >();

  for (const volume of volumes) {
    const category = classifyVolumeCategory(volume);
    const price = effectiveCatalogPrice(volume, defaultPrice);
    const key = `${category}|${price?.toFixed(2) ?? "none"}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, { category, count: 1, price });
    }
  }

  return [...groups.values()].sort((a, b) => {
    const categoryDiff =
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    if (categoryDiff !== 0) {
      return categoryDiff;
    }
    return (a.price ?? 0) - (b.price ?? 0);
  });
}

function formatChapterCountsPart(profile: WorkTrackingProfile): string | null {
  const parts: string[] = [];
  if (profile.chapterVfCount != null) {
    parts.push(`${formatTrackingUnitCount(profile.chapterVfCount, "chapter")} VF`);
  }
  if (profile.chapterVoTotal != null) {
    parts.push(`${formatTrackingUnitCount(profile.chapterVoTotal, "chapter")} VO`);
  }
  return parts.length > 0 ? parts.join(" / ") : null;
}

function formatVolumeCountsPart(
  profile: WorkTrackingProfile,
  physicalVolumes: VolumeStatsInput[],
): string | null {
  const parts: string[] = [];
  const vfCount =
    profile.volumeVfCount ??
    (physicalVolumes.length > 0 ? physicalVolumes.length : null);
  if (vfCount != null) {
    parts.push(`${formatTrackingUnitCount(vfCount, "volume")} VF`);
  }
  if (profile.volumeVoTotal != null) {
    parts.push(`${formatTrackingUnitCount(profile.volumeVoTotal, "volume")} VO`);
  }
  return parts.length > 0 ? parts.join(" / ") : null;
}

function formatVolumeEditionBreakdownPart(
  physicalVolumes: VolumeStatsInput[],
  defaultPrice: number | null,
  priceFormat: PriceFormat,
): string | null {
  const groups = groupVolumesByCategoryAndPrice(physicalVolumes, defaultPrice);
  if (groups.length === 0) {
    return null;
  }

  const formatLabel = formatPriceFormatLabel(priceFormat);
  return groups
    .map(({ category, count, price }) => {
      const label = `${CATEGORY_LABELS[category]} : ${formatTrackingUnitCount(count, "volume")}`;
      if (price == null) {
        return label;
      }
      return `${label} (${formatCurrency(price)} ${formatLabel})`;
    })
    .join(" / ");
}

/**
 * @description Ligne stats fiche détail (hybride tomes + chapitres).
 */
export function formatWorkStatsLine(
  volumes: VolumeStatsInput[],
  profile: WorkTrackingProfile,
  defaultPrice: number | null,
  priceFormat: PriceFormat,
): string | null {
  const physicalVolumes = volumes.filter(
    (volume) => !isChapterSeriesPlaceholder(volume as VolumeFormRow),
  );
  const parts: string[] = [];

  if (profile.hasChapterTracking) {
    const chapterPart = formatChapterCountsPart(profile);
    if (chapterPart) {
      parts.push(chapterPart);
    }
  }

  if (profile.hasVolumeTracking) {
    const volumeCounts = formatVolumeCountsPart(profile, physicalVolumes);
    const editionPart = formatVolumeEditionBreakdownPart(
      physicalVolumes,
      defaultPrice,
      priceFormat,
    );
    if (volumeCounts) {
      parts.push(volumeCounts);
    }
    if (editionPart) {
      parts.push(editionPart);
    }
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * @description @deprecated Préférer formatWorkStatsLine avec profil hybride.
 */
export function formatWorkVolumeStatsLine(
  volumes: VolumeStatsInput[],
  volumesVfCount: number | null,
  volumesVoTotal: number | null,
  defaultPrice: number | null,
  priceFormat: PriceFormat,
  trackingUnit: "volume" | "chapter" = "volume",
): string | null {
  const profile = {
    hasVolumeTracking: trackingUnit !== "chapter",
    hasChapterTracking: trackingUnit === "chapter",
    volumeVfCount: trackingUnit === "chapter" ? null : volumesVfCount,
    volumeVoTotal: trackingUnit === "chapter" ? null : volumesVoTotal,
    chapterVfCount: trackingUnit === "chapter" ? volumesVfCount : null,
    chapterVoTotal: trackingUnit === "chapter" ? volumesVoTotal : null,
    trackingUnit,
  };

  return formatWorkStatsLine(volumes, profile, defaultPrice, priceFormat);
}
