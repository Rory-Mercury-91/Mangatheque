import type { PriceFormat, TrackingUnit } from "@/types/database";
import type { VolumeFormRow } from "@/types/workForm";
import {
  isChapterSeriesPlaceholder,
} from "@/utils/chapterSeries";
import { formatCurrency } from "@/utils/ownerDisplay";
import { formatTrackingUnitCount } from "@/utils/volumeDisplay";

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

/**
 * @description Libellé format prix (Broché / Numérique).
 */
function formatPriceFormatLabel(priceFormat: PriceFormat): string {
  return priceFormat === "broche" ? "Broché" : "Numérique";
}

/**
 * @description Catégorie d'édition d'un tome (spécial > collector > simple).
 */
function classifyVolumeCategory(volume: VolumeStatsInput): VolumeCategory {
  if (volume.volumeLabel?.trim()) {
    return "special";
  }
  if (volume.editionType === "collector") {
    return "collector";
  }
  return "simple";
}

/**
 * @description Prix catalogue effectif (override Nautiljon ou prix par défaut).
 */
function effectiveCatalogPrice(
  volume: VolumeStatsInput,
  defaultPrice: number | null,
): number | null {
  const price = volume.catalogPrice ?? defaultPrice;
  return price != null && price > 0 ? price : null;
}

/**
 * @description Regroupe les unités par catégorie et prix catalogue.
 */
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

/**
 * @description Partie VF / VO de la ligne stats.
 */
function formatVolumeCountsPart(
  volumesVfCount: number | null,
  volumesVoTotal: number | null,
  volumes: VolumeStatsInput[],
  trackingUnit: TrackingUnit,
): string | null {
  const parts: string[] = [];

  const vfCount =
    volumesVfCount ?? (volumes.length > 0 ? volumes.length : null);
  if (vfCount != null) {
    parts.push(`${formatTrackingUnitCount(vfCount, trackingUnit)} VF`);
  }

  if (volumesVoTotal != null) {
    parts.push(`${formatTrackingUnitCount(volumesVoTotal, trackingUnit)} VO`);
  }

  return parts.length > 0 ? parts.join(" / ") : null;
}

/**
 * @description Partie éditions avec prix et format (Simple, Collector, Spécial…).
 */
function formatEditionBreakdownPart(
  volumes: VolumeStatsInput[],
  volumesVfCount: number | null,
  defaultPrice: number | null,
  priceFormat: PriceFormat,
  trackingUnit: TrackingUnit,
): string | null {
  if (trackingUnit === "chapter") {
    const count =
      volumesVfCount ??
      volumes.filter(
        (volume) => !isChapterSeriesPlaceholder(volume as VolumeFormRow),
      ).length;

    if (count <= 0) {
      return null;
    }

    const formatLabel = formatPriceFormatLabel(priceFormat);
    const label = `Simple : ${formatTrackingUnitCount(count, trackingUnit)}`;
    const price = defaultPrice;
    if (price == null || price <= 0) {
      return label;
    }
    return `${label} (${formatCurrency(price)} ${formatLabel})`;
  }

  const groups = groupVolumesByCategoryAndPrice(volumes, defaultPrice);
  if (groups.length === 0) {
    return null;
  }

  const formatLabel = formatPriceFormatLabel(priceFormat);

  return groups
    .map(({ category, count, price }) => {
      const label = `${CATEGORY_LABELS[category]} : ${formatTrackingUnitCount(count, trackingUnit)}`;
      if (price == null) {
        return label;
      }
      return `${label} (${formatCurrency(price)} ${formatLabel})`;
    })
    .join(" / ");
}

/**
 * @description Ligne stats complète : VF/VO puis répartition éditions avec prix.
 */
export function formatWorkVolumeStatsLine(
  volumes: VolumeStatsInput[],
  volumesVfCount: number | null,
  volumesVoTotal: number | null,
  defaultPrice: number | null,
  priceFormat: PriceFormat,
  trackingUnit: TrackingUnit = "volume",
): string | null {
  const countsPart = formatVolumeCountsPart(
    volumesVfCount,
    volumesVoTotal,
    volumes,
    trackingUnit,
  );
  const editionsPart = formatEditionBreakdownPart(
    volumes,
    volumesVfCount,
    defaultPrice,
    priceFormat,
    trackingUnit,
  );

  const parts = [countsPart, editionsPart].filter(
    (part): part is string => part != null && part.length > 0,
  );

  return parts.length > 0 ? parts.join(" · ") : null;
}
