// ==UserScript==
// @name         Nautiljon → Mangathèque
// @namespace    https://github.com/Rory-Mercury-91/Mangatheque
// @version      1.8.4
// @description  Envoie les fiches manga/LN/webtoon Nautiljon vers Mangathèque — récap éditable, import direct ou contrôlé
// @author       Mangathèque
// @match        https://www.nautiljon.com/mangas/*
// @match        https://www.nautiljon.com/light_novels/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @connect      127.0.0.1
// @connect      localhost
// @connect      nautiljon.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const PORT = 40000;
  const BASE = `http://127.0.0.1:${PORT}`;
  /** Nombre de pages tome fetchées en parallèle (HTML uniquement, pas de téléchargement d'images). */
  const VOLUME_FETCH_CONCURRENCY = 4;
  /** Pause entre chaque lot parallèle pour limiter le rate-limit Nautiljon. */
  const VOLUME_FETCH_BATCH_DELAY_MS = 350;
  /** Pause allongée après un lot avec erreurs 429. */
  const VOLUME_FETCH_COOLDOWN_AFTER_ERROR_MS = 2500;
  /** Nouvelle passe en fin d'import : 1 requête à la fois, délai plus long. */
  const VOLUME_FETCH_RETRY_DELAY_MS = 3000;
  const VOLUME_FETCH_RETRY_MAX_PASSES = 2;

  /** Comptes propriétaires proposés dans l'overlay d'import. */
  const OWNER_OPTIONS = ["Céline", "Sébastien", "Alexandre"];

  let importChronoStartMs = null;

  function startImportChrono() {
    importChronoStartMs = performance.now();
    console.log("⏱ Début du chrono — import Mangathèque");
  }

  function stopImportChrono(phase) {
    if (importChronoStartMs == null) return null;
    const elapsedMs = performance.now() - importChronoStartMs;
    importChronoStartMs = null;
    const formatted =
      elapsedMs < 1000
        ? `${Math.round(elapsedMs)} ms`
        : `${(elapsedMs / 1000).toFixed(1)} s`;
    console.log(`⏱ Fin du chrono (${phase}) — ${formatted}`);
    return formatted;
  }

  function formatVolumeNumberDisplay(value) {
    if (value == null || !Number.isFinite(value)) return "—";
    return Number.isInteger(value) ? String(value) : String(value);
  }

  function normalizeVolumeNumberToken(raw) {
    if (raw == null || String(raw).trim() === "") return null;
    let token = String(raw).trim().replace(",", ".");
    if (/^\d+-\d+$/.test(token) && !token.includes(".")) {
      const [whole, fraction] = token.split("-");
      if (fraction.length <= 2) token = `${whole}.${fraction}`;
    } else {
      token = token.replace(/_/g, ".");
    }
    const value = Number(token);
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.round(value * 100) / 100;
  }

  function volumeDisplayLabel(vol, trackingUnit) {
    const unit = trackingUnit === "chapter" ? "Chapitre" : "Tome";
    if (vol.volumeLabel) return vol.volumeLabel;
    if (vol.volumeNumber != null) {
      return `${unit} ${formatVolumeNumberDisplay(vol.volumeNumber)}`;
    }
    return "Hors-série";
  }

  /**
   * @description Statistiques tomes pour le récap d'import.
   */
  function summarizePayloadVolumes(volumes) {
    const list = volumes || [];
    const numbered = list.filter(
      (v) => v.volumeNumber != null && !v.volumeLabel,
    ).length;
    const labeled = list.filter((v) => v.volumeLabel).length;
    const collectors = list.filter((v) => v.editionType === "collector").length;
    const withDate = list.filter((v) => v.releaseDate).length;
    const withCover = list.filter((v) => v.coverUrl).length;
    const withPrice = list.filter((v) => v.catalogPrice != null).length;
    return {
      total: list.length,
      numbered,
      labeled,
      collectors,
      withDate,
      withCover,
      withPrice,
    };
  }

  /**
   * @description Récap console + texte toast après import / export.
   */
  function logImportRecap(payload, elapsed, mode) {
    const stats = summarizePayloadVolumes(payload.volumes);
    const timing = elapsed || "?";
    const modeLabel = mode === "export" ? "export JSON" : "import Mangathèque";

    console.log(`\n${"═".repeat(52)}`);
    console.log(`📚 Série « ${payload.title} » récupérée en ${timing} (${modeLabel})`);
    console.log(`   ${stats.total} tome(s) récupéré(s)`);
    console.log(
      `   ${stats.numbered} numéroté(s) · ${stats.labeled} hors-série · ${stats.collectors} collector`,
    );
    console.log(
      `   ${stats.withDate}/${stats.total} avec date VF · ${stats.withCover}/${stats.total} avec couverture · ${stats.withPrice}/${stats.total} avec prix`,
    );
    if (stats.withDate < stats.total) {
      console.warn(
        `   ⚠️ ${stats.total - stats.withDate} tome(s) sans date VF (voir tableau ci-dessous)`,
      );
    }
    if (payload.publisherVf) {
      console.log(`   Éditeur VF : ${payload.publisherVf}`);
    }
    if (payload.readingStatus) {
      console.log(`   Statut lecture : ${payload.readingStatus}`);
    }
    if (payload.volumesVfCount != null) {
      const unitLabel = payload.trackingUnit === "chapter" ? "chapitres" : "volumes";
      console.log(`   Nb ${unitLabel} VF (meta Nautiljon) : ${payload.volumesVfCount}`);
    }
    if (payload.defaultPrice != null) {
      console.log(`   Prix indicatif : ${payload.defaultPrice} €`);
    }
    if (payload.mihonOwnerName) {
      console.log(`   Mihon : ${payload.mihonOwnerName}`);
    } else if (payload.ownerNames?.length) {
      console.log(`   Achat : ${payload.ownerNames.join(", ")}`);
    }

    const tableRows = (payload.volumes || []).map((v) => ({
      Tome: v.volumeNumber ?? "—",
      Libellé: v.volumeLabel || "",
      Édition: v.editionType === "collector" ? "Collector" : "Simple",
      "Date VF": v.releaseDate || "—",
      Prix: v.catalogPrice != null ? `${v.catalogPrice} €` : "—",
      Couverture: v.coverUrl ? "✓" : "✗",
    }));
    if (tableRows.length > 0) {
      console.log("   Détail des tomes :");
      console.table(tableRows);
    }

    console.log("   Payload complet :", payload);
    console.log(`${"═".repeat(52)}\n`);

    return stats;
  }

  function buildImportRecapToast(payload, elapsed, stats, queued) {
    const timing = elapsed ? ` en <strong>${elapsed}</strong>` : "";
    const extras = [];
    if (stats.labeled > 0) extras.push(`${stats.labeled} hors-série`);
    if (stats.collectors > 0) extras.push(`${stats.collectors} collector`);
    const extraLine = extras.length
      ? `<br><span style="opacity:.88;font-size:12px">${extras.join(" · ")}</span>`
      : "";
    const footer = queued
      ? " Validez dans l'app."
      : "";

    return `📥 <strong>${payload.title}</strong> récupérée${timing} — <strong>${stats.total} tomes</strong>.${footer}${extraLine}`;
  }

  function buildExportRecapToast(payload, elapsed, stats) {
    const timing = elapsed ? ` en <strong>${elapsed}</strong>` : "";
    const extras = [];
    if (stats.labeled > 0) extras.push(`${stats.labeled} hors-série`);
    if (stats.collectors > 0) extras.push(`${stats.collectors} collector`);
    const extraLine = extras.length
      ? `<br><span style="opacity:.88;font-size:12px">${extras.join(" · ")}</span>`
      : "";

    return `📋 <strong>${payload.title}</strong> récupérée${timing} — <strong>${stats.total} tomes</strong>.${extraLine}`;
  }

  function normalizeSpace(value) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function toAbsoluteUrl(value) {
    const raw = normalizeSpace(value);
    if (!raw) return "";
    try {
      return new URL(raw, "https://www.nautiljon.com").href;
    } catch {
      return raw;
    }
  }

  function parsePriceEur(value) {
    const match = normalizeSpace(value).match(/(\d+(?:[.,]\d+)?)\s*€/);
    if (!match) return null;
    const n = Number(match[1].replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function toIsoDate(value) {
    const raw = normalizeSpace(value);
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const monthsFr = {
      janvier: "01",
      fevrier: "02",
      février: "02",
      mars: "03",
      avril: "04",
      mai: "05",
      juin: "06",
      juillet: "07",
      aout: "08",
      août: "08",
      septembre: "09",
      octobre: "10",
      novembre: "11",
      decembre: "12",
      décembre: "12",
    };

    const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
      return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
    }

    const fr = raw.match(/^(\d{1,2})\s+([a-zéûôîàùç]+)\s+(\d{4})$/i);
    if (fr) {
      const monthKey = fr[2]
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      const month = monthsFr[fr[2].toLowerCase()] || monthsFr[monthKey];
      if (month) {
        return `${fr[3]}-${month}-${fr[1].padStart(2, "0")}`;
      }
    }
    return null;
  }

  const RELEASE_DATE_PATTERN =
    /(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[a-zéûôîàùç]+?\s+\d{4})/i;

  /**
   * @description Extrait la date de parution VF (ignore explicitement la VO).
   */
  function extractReleaseDateVfFromText(text) {
    const normalized = normalizeSpace(text);
    if (!normalized) return null;

    const vfMatch = normalized.match(
      /(?:Date de parution|Parution)\s*VF\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[a-zéûôîàùç]+?\s+\d{4})/i,
    );
    if (vfMatch) return toIsoDate(vfMatch[1]);

    const voMatch = normalized.match(
      /(?:Date de parution|Parution)\s*VO\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[a-zéûôîàùç]+?\s+\d{4})/i,
    );

    const genericMatch = normalized.match(
      /(?:Date de parution|Parution)\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[a-zéûôîàùç]+?\s+\d{4})/i,
    );
    if (genericMatch) {
      const labelSlice = normalized.slice(
        Math.max(0, genericMatch.index - 5),
        genericMatch.index + 20,
      );
      if (!/VO/i.test(labelSlice)) {
        return toIsoDate(genericMatch[1]);
      }
    }

    if (!voMatch) {
      const bare = normalized.match(RELEASE_DATE_PATTERN);
      if (bare) return toIsoDate(bare[1]);
    }
    return null;
  }

  /**
   * @description Date VF depuis une page tome Nautiljon (métadonnées ou libellés).
   */
  function extractReleaseDateVfFromDoc(doc) {
    const meta = extractMetadataFromDoc(doc);
    for (const key of ["Date de parution VF", "Parution VF"]) {
      const raw = meta[key];
      if (!raw) continue;
      const iso = extractReleaseDateVfFromText(`Parution VF: ${raw}`) || toIsoDate(raw);
      if (iso) return iso;
    }

    for (const node of doc.querySelectorAll("ul.mb10 li, li, dd, p")) {
      const text = normalizeSpace(node.textContent);
      if (!/(Date de parution|Parution)\s*VF/i.test(text)) continue;
      const iso = extractReleaseDateVfFromText(text);
      if (iso) return iso;
    }
    return null;
  }

  function formatIsoDateFr(iso) {
    if (!iso) return "—";
    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return iso;
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  function formatPriceInputValue(price) {
    if (price == null || !Number.isFinite(price)) return "";
    return String(price).replace(".", ",");
  }

  /** @description Prix saisi dans l'overlay (accepte « 12,50 » ou « 12,50 € »). */
  function parsePriceInput(value) {
    const fromEur = parsePriceEur(value);
    if (fromEur != null) return fromEur;
    const trimmed = normalizeSpace(value).replace(",", ".");
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function extractTitle() {
    const node =
      document.querySelector('h1 span[itemprop="name"]') || document.querySelector("h1");
    if (!node) return "";
    const clone = node.cloneNode(true);
    clone.querySelectorAll("a, button").forEach((n) => n.remove());
    return normalizeSpace(clone.textContent).replace(/^modifier\s+/i, "");
  }

  function extractSynopsis() {
    const node = document.querySelector(".description, #description, [itemprop='description']");
    if (!node) return null;
    const clone = node.cloneNode(true);
    clone.querySelectorAll(".fader, .showmore, a, button").forEach((n) => n.remove());
    return normalizeSpace(clone.textContent) || null;
  }

  function extractMetadataBlock() {
    return extractMetadataFromDoc(document);
  }

  function extractMetadataFromDoc(root) {
    const metaList = root.querySelector("ul.mb10");
    if (!metaList) return {};
    const meta = {};
    for (const item of metaList.querySelectorAll("li")) {
      const labelNode = item.querySelector("span.bold, .bold");
      if (!labelNode) continue;
      const label = normalizeSpace(labelNode.textContent).replace(/\s*:\s*$/, "");
      const clone = item.cloneNode(true);
      clone.querySelectorAll("span.bold, .bold").forEach((n) => n.remove());
      meta[label] = normalizeSpace(clone.textContent);
    }
    return meta;
  }

  /**
   * @description Retourne la première clé métadonnée non vide (singulier / pluriel Nautiljon).
   */
  function getMetaValue(meta, ...keys) {
    for (const key of keys) {
      const value = meta[key];
      if (value != null && String(value).trim()) {
        return normalizeSpace(String(value));
      }
    }
    return "";
  }

  /**
   * @description Extrait genres ou thèmes depuis les liens Nautiljon, avec repli sur le texte brut.
   */
  function extractTaggedListFromDoc(root, labelVariants) {
    const metaList = root.querySelector("ul.mb10");
    if (!metaList) return [];

    for (const item of metaList.querySelectorAll("li")) {
      const labelNode = item.querySelector("span.bold, .bold");
      if (!labelNode) continue;
      const label = normalizeSpace(labelNode.textContent).replace(/\s*:\s*$/, "");
      const matches = labelVariants.some(
        (variant) => normalizeAscii(label) === normalizeAscii(variant),
      );
      if (!matches) continue;

      const fromLinks = Array.from(item.querySelectorAll("a[href]"))
        .map((anchor) => normalizeSpace(anchor.textContent))
        .filter(Boolean);
      if (fromLinks.length > 0) return fromLinks;

      const clone = item.cloneNode(true);
      clone.querySelectorAll("span.bold, .bold").forEach((node) => node.remove());
      return splitTags(normalizeSpace(clone.textContent));
    }

    return [];
  }

  /**
   * @description Éditeur(s) VF — Nautiljon passe au pluriel quand plusieurs éditeurs.
   */
  function resolvePublisherVf(meta) {
    return getMetaValue(meta, "Éditeurs VF", "Éditeur VF", "Éditeur");
  }

  /**
   * @description Libellé court pour édition : préfère l'éditeur actif si plusieurs avec licence expirée.
   */
  function pickPrimaryPublisherVf(raw) {
    if (!raw) return "";
    const parts = raw
      .split(",")
      .map((part) => normalizeSpace(part))
      .filter(Boolean);
    const active = parts.filter((part) => !/licence\s*expir/i.test(part));
    if (active.length > 0) return active.join(", ");
    return parts[0] || raw;
  }

  function extractPriceFromDoc(doc) {
    const meta = extractMetadataFromDoc(doc);
    const fromMeta = parsePriceEur(meta["Prix"] || "");
    if (fromMeta != null) return fromMeta;

    for (const node of doc.querySelectorAll("li, dd, p")) {
      const text = normalizeSpace(node.textContent);
      if (!/prix/i.test(text)) continue;
      const price = parsePriceEur(text);
      if (price != null) return price;
    }
    return null;
  }

  function splitTags(raw) {
    return String(raw || "")
      .split(/[-|,•]/g)
      .map((t) => normalizeSpace(t))
      .filter(Boolean);
  }

  function extractCoverUrl() {
    const image =
      document.querySelector(".coverimg img") ||
      document.querySelector(".cover img") ||
      document.querySelector("img[itemprop='image']");
    if (!image) return "";
    let src = image.getAttribute("src") || "";
    src = src.replace("/mini/", "/").replace("/imagesmin/", "/images/");
    src = src.replace(/\?1(\d{10,})/, "?$1");
    return toAbsoluteUrl(src);
  }

  function hasFranceFlag(header) {
    return Array.from(header.querySelectorAll("img")).some((img) => {
      const alt = (img.getAttribute("alt") || "").toLowerCase();
      const title = (img.getAttribute("title") || "").toLowerCase();
      return alt.includes("france") || title.includes("france");
    });
  }

  function detectEditionLanguage(header) {
    if (!header) return "unknown";

    for (const img of header.querySelectorAll("img")) {
      const blob = normalizeAscii(
        `${img.getAttribute("alt") || ""} ${img.getAttribute("title") || ""}`,
      );
      if (blob.includes("france") || blob.includes("francais")) return "fr";
      if (blob.includes("japon") || blob.includes("japan")) return "jp";
      if (blob.includes("coree") || blob.includes("korea")) return "kr";
      if (blob.includes("usa") || blob.includes("etats")) return "us";
    }

    const text = normalizeAscii(header.textContent || "");
    if (text.includes(" vf") || text.startsWith("vf ") || text.includes("francais")) {
      return "fr";
    }
    if (text.includes(" vo") || text.startsWith("vo ") || text.includes("japon")) {
      return "jp";
    }
    return "unknown";
  }

  function inferFallbackEditionLabel(meta) {
    const publisher = pickPrimaryPublisherVf(resolvePublisherVf(meta));
    if (publisher) {
      return `${publisher} (VF)`;
    }
    if (meta["Éditeur VO"]) {
      return `${meta["Éditeur VO"]} (VO)`;
    }
    return "Volumes";
  }

  function isLikelyFrenchEditionLabel(label, meta) {
    if (resolvePublisherVf(meta)) return true;
    const blob = normalizeAscii(label);
    return blob.includes(" vf") || blob.includes("francais") || blob.includes("france");
  }

  /**
   * @description Liste tous les blocs édition (chapitres + tomes), sans s'arrêter au premier trouvé.
   */
  function listAllEditions() {
    const editions = [];
    const seenIds = new Set();
    const meta = extractMetadataBlock();

    for (const header of document.querySelectorAll("h2 a.infos_edition")) {
      const id = header.getAttribute("onclick")?.match(/swap\('([^']+)'\)/)?.[1];
      if (!id || seenIds.has(id)) continue;
      const block = document.getElementById(id);
      if (!block) continue;
      seenIds.add(id);

      const label = normalizeSpace(header.textContent).replace(/\s*\(\d+.*\)\s*$/, "");
      const lang = detectEditionLanguage(header);
      editions.push({
        id,
        label,
        block,
        isFrench: lang === "fr" || hasFranceFlag(header),
        lang,
        contentKind: inferContentKindFromBlock(block, meta),
        metadataOnly: false,
      });
    }

    const roots = [];
    for (const h2 of document.querySelectorAll("h2")) {
      if (isContentSectionHeading(h2.textContent)) {
        const top = h2.closest(".top_bloc") || h2.parentElement;
        if (top) roots.push(top);
      }
    }
    if (roots.length === 0) {
      roots.push(document);
    }

    for (const root of roots) {
      for (const block of root.querySelectorAll('div[id^="edition_"]')) {
        const id = block.id;
        if (!/^edition_\d+$/.test(id) || seenIds.has(id)) continue;
        if (!block.querySelector("h3") && !block.querySelector(".unVol, .unChap")) {
          continue;
        }
        seenIds.add(id);

        const heading = getTopBlocHeading(block);
        const contentKind = /chapitres?/.test(heading) ? "chapter" : "volume";
        const label =
          contentKind === "chapter"
            ? `${pickPrimaryPublisherVf(resolvePublisherVf(meta)) || meta["Prépublié dans"] || "Chapitres"} (VF)`
            : inferFallbackEditionLabel(meta);

        editions.push({
          id,
          label,
          block,
          isFrench: isLikelyFrenchEditionLabel(label, meta),
          lang: isLikelyFrenchEditionLabel(label, meta) ? "fr" : "unknown",
          contentKind,
          metadataOnly: false,
        });
      }
    }

    const hasChapter = editions.some((e) => e.contentKind === "chapter" && e.isFrench);
    const hasVolume = editions.some((e) => e.contentKind === "volume" && e.isFrench);

    if (!hasChapter) {
      const chapterEdition = createMetadataOnlyEdition(meta, "chapter");
      if (chapterEdition) editions.push(chapterEdition);
    }
    if (!hasVolume) {
      const volumeEdition = createMetadataOnlyEdition(meta, "volume");
      if (volumeEdition) editions.push(volumeEdition);
    }

    return editions;
  }

  /** @deprecated Alias interne — utiliser listAllEditions. */
  function listVolumeEditions() {
    return listAllEditions();
  }

  /**
   * @description Catalogue chapitres / tomes détectés pour la modale d'import.
   */
  function buildImportCatalog() {
    const meta = extractMetadataBlock();
    const allEditions = listAllEditions();

    function buildProfile(contentKind) {
      const vfKey = contentKind === "chapter" ? "Nb chapitres VF" : "Nb volumes VF";
      const voKey = contentKind === "chapter" ? "Nb chapitres VO" : "Nb volumes VO";
      const vfRaw = meta[vfKey] || "";
      const voRaw = meta[voKey] || "";
      const vfCount = parseVfVolumeCount(vfRaw);
      const editions = allEditions.filter(
        (edition) => edition.contentKind === contentKind && edition.isFrench,
      );
      const available = editions.length > 0 || vfCount != null;
      const defaultEdition =
        editions.find((edition) => !edition.metadataOnly) || editions[0] || null;

      return {
        contentKind,
        available,
        vfRaw,
        voRaw,
        vfCount,
        readingStatus: mapReadingStatusFromVfMeta(vfRaw),
        editions,
        defaultEditionId: defaultEdition?.id ?? null,
        listedCount: defaultEdition?.block
          ? parseEditionSections(defaultEdition.block).reduce(
              (sum, section) => sum + section.volumes.length,
              0,
            )
          : 0,
        metadataOnly: editions.every((edition) => edition.metadataOnly),
        priceFormat:
          contentKind === "chapter" &&
          !String(meta["Type volume"] || "").toLowerCase().includes("broch")
            ? "numerique"
            : mapPriceFormat(meta["Type volume"] || "Broché"),
      };
    }

    return {
      meta,
      chapter: buildProfile("chapter"),
      volume: buildProfile("volume"),
    };
  }

  function formatProfileSummary(profile) {
    if (!profile.available) return "Non détecté";
    const parts = [];
    if (profile.vfCount != null) {
      parts.push(`${profile.vfCount} VF`);
    } else if (profile.vfRaw) {
      parts.push(profile.vfRaw);
    }
    if (profile.readingStatus) {
      const labels = {
        ongoing: "En cours",
        completed: "Terminé",
        dropped: "Abandonné",
        on_hold: "En attente",
      };
      parts.push(labels[profile.readingStatus] || profile.readingStatus);
    }
    parts.push(profile.priceFormat === "numerique" ? "Numérique" : "Broché");
    if (profile.listedCount > 0) {
      parts.push(`${profile.listedCount} listé${profile.listedCount > 1 ? "s" : ""}`);
    } else if (profile.metadataOnly) {
      parts.push("Métadonnées");
    }
    return parts.join(" · ");
  }

  function pickDefaultEditionId(volumeEditions) {
    const meta = extractMetadataBlock();
    const preferChapter =
      meta["Webcomic"] === "Oui" && Boolean(meta["Nb chapitres VF"]);
    if (preferChapter) {
      const chapterEdition = volumeEditions.find(
        (edition) => edition.contentKind === "chapter" && edition.isFrench,
      );
      if (chapterEdition) return chapterEdition.id;
    }
    return (volumeEditions.find((edition) => edition.isFrench) || volumeEditions[0])
      .id;
  }

  function formatEditionChoiceLabel(edition) {
    const suffix = edition.isFrench ? " — VF" : edition.lang === "jp" ? " — VO" : "";
    const kind =
      edition.contentKind === "chapter"
        ? "Chapitres"
        : edition.metadataOnly
          ? "Métadonnées"
          : "Volumes";
    return `${edition.label} (${kind})${suffix}`;
  }

  function classifySection(title) {
    const t = normalizeAscii(title);
    if (t.includes("coffret")) return "coffret";
    if (t.includes("fanbook")) return "fanbook";
    if (t.includes("collector")) return "collector";
    if (t.includes("special")) return "special";
    if (t.includes("chapitre") || t.includes("saison") || t.includes("episode")) {
      return "chapter";
    }
    if (t.includes("volume simple") || t.includes("broche")) return "simple";
    return "other";
  }

  function defaultSectionChecked(kind) {
    return kind === "simple" || kind === "chapter";
  }

  /**
   * @description Indique si un tome/chapitre doit être coché par défaut selon le compteur VF.
   */
  function shouldSelectVolumeByDefault(vol, vfCount, sectionDefault) {
    if (!sectionDefault) return false;
    if (!vfCount || vfCount <= 0) return true;
    if (vol.volumeLabel?.trim()) return true;
    if (vol.volumeNumber != null) return vol.volumeNumber <= vfCount;
    return true;
  }

  /**
   * @description Tome listé sur Nautiljon mais au-delà du compteur VF (annoncé, non paru).
   */
  function isVolumeBeyondVfCount(vol, vfCount) {
    if (!vfCount || vfCount <= 0) return false;
    if (vol.volumeLabel?.trim()) return false;
    if (vol.volumeNumber != null) return vol.volumeNumber > vfCount;
    return false;
  }

  function getTopBlocHeading(block) {
    const top = block?.closest(".top_bloc");
    if (!top) return "";
    const h2 = top.querySelector("h2");
    return normalizeAscii(h2?.textContent || "");
  }

  function inferContentKindFromBlock(block, meta) {
    const heading = getTopBlocHeading(block);
    if (/chapitres?/.test(heading)) return "chapter";
    if (/volumes?|planches?/.test(heading)) return "volume";
    if (meta["Webcomic"] === "Oui" && meta["Nb chapitres VF"] && !meta["Nb volumes VF"]) {
      return "chapter";
    }
    return "volume";
  }

  function parseChapterNumberFromHref(href) {
    const standard = href.match(/\/chapitre-(\d+),/i);
    if (standard) return Number(standard[1]);
    const encoded = href.match(/\/chapitre-ch\.?\+(\d+)/i);
    if (encoded) return Number(encoded[1]);
    return null;
  }

  function parseChapterNumberFromText(text) {
    const raw = normalizeSpace(text);
    const chapMatch = raw.match(/(?:^|\s)ch(?:apitre)?\.?\s*(\d+)/i);
    if (chapMatch) return Number(chapMatch[1]);
    return null;
  }

  function createMetadataOnlyEdition(meta, contentKind) {
    const isChapter = contentKind === "chapter";
    const vfRaw = isChapter ? meta["Nb chapitres VF"] : meta["Nb volumes VF"];
    const count = parseVfVolumeCount(vfRaw || "");
    if (!count) return null;
    return {
      id: `meta-${contentKind}-vf`,
      label: `${pickPrimaryPublisherVf(resolvePublisherVf(meta)) || (isChapter ? "Chapitres" : "Volumes")} (VF)`,
      block: null,
      isFrench: true,
      lang: "fr",
      contentKind,
      metadataOnly: true,
    };
  }

  function isContentSectionHeading(text) {
    return /^(volumes?|planches?|chapitres?)$/i.test(normalizeAscii(text));
  }

  function formatVolumeListLabel(vol) {
    if (vol.volumeLabel) return vol.volumeLabel;
    if (vol.volumeNumber != null) {
      return `Vol. ${formatVolumeNumberDisplay(vol.volumeNumber)}`;
    }
    return "Hors-série";
  }

  function parseVolumeNumberFromText(text) {
    const raw = normalizeSpace(text);
    const volMatch = raw.match(/(?:^|\s)vol\.?\s*(\d+(?:[.,]\d+)?)/i);
    if (volMatch) return normalizeVolumeNumberToken(volMatch[1]);
    const coffretMatch = raw.match(/vol\.?\s*(\d+)\s*[àa]\s*(\d+)/i);
    if (coffretMatch) return Number(coffretMatch[1]);
    return null;
  }

  function parseVolumeNumberFromHref(href) {
    const encoded = href.match(/\/volume-vol\.\+(\d+(?:[.,]\d+)?),/i);
    if (encoded) return normalizeVolumeNumberToken(encoded[1]);
    const standard = href.match(/\/volume-(\d+(?:[._-]\d+)?),/i);
    if (standard) return normalizeVolumeNumberToken(standard[1]);
    return null;
  }

  function inferEditionType(sectionKind, titleAttr, labelText) {
    const blob = normalizeAscii(`${titleAttr} ${labelText}`);
    if (sectionKind === "collector" || blob.includes("collector")) {
      return "collector";
    }
    return "classic";
  }

  /**
   * @description Numéro utilisé uniquement pour détecter les doublons entre sections.
   * Les spéciaux/fanbooks gardent volumeNumber null en base mais peuvent référencer un n° de série.
   */
  function resolveConflictVolumeNumber(volumeNumber, href, titleAttr, labelText) {
    if (volumeNumber != null) return volumeNumber;
    return (
      parseVolumeNumberFromHref(href) ||
      parseChapterNumberFromHref(href) ||
      parseVolumeNumberFromText(titleAttr) ||
      parseChapterNumberFromText(labelText) ||
      null
    );
  }

  function isUnnumberedSectionKind(sectionKind) {
    return sectionKind === "fanbook" || sectionKind === "special";
  }

  function parseVolumeNode(node, sectionTitle, sectionKind) {
    const volumeAnchor = node.querySelector("a[href*='/volume-']");
    const chapterAnchor = node.querySelector("a[href*='/chapitre-']");
    const anchor = volumeAnchor || chapterAnchor;
    if (!anchor) return null;

    const isChapter = Boolean(chapterAnchor && !volumeAnchor);
    const href = anchor.getAttribute("href") || "";
    const titleAttr = anchor.getAttribute("title") || "";
    const labelText = normalizeSpace(
      node.querySelector("label")?.textContent || titleAttr || anchor.getAttribute("alt") || "",
    );

    if (sectionKind === "coffret") {
      return null;
    }

    let volumeNumber = isChapter
      ? parseChapterNumberFromHref(href) ||
        parseChapterNumberFromText(titleAttr) ||
        parseChapterNumberFromText(labelText)
      : parseVolumeNumberFromHref(href) ||
        parseVolumeNumberFromText(titleAttr) ||
        parseVolumeNumberFromText(labelText);

    let volumeLabel = null;

    if (isUnnumberedSectionKind(sectionKind)) {
      volumeLabel = labelText || titleAttr;
      if (!volumeLabel) return null;
      const conflictVolumeNumber = resolveConflictVolumeNumber(
        null,
        href,
        titleAttr,
        labelText,
      );
      volumeNumber = null;
    } else if (!volumeNumber) {
      volumeLabel = labelText || titleAttr;
      if (!volumeLabel || /^vol\.?\s*\d+(?:[.,]\d+)?/i.test(volumeLabel) || /^ch(?:apitre)?\.?\s*\d/i.test(volumeLabel)) {
        return null;
      }
    }

    const conflictVolumeNumber = resolveConflictVolumeNumber(
      volumeNumber,
      href,
      titleAttr,
      labelText,
    );

    let coverUrl = null;
    const thumb = node.querySelector("img");
    if (thumb) {
      let src = thumb.getAttribute("src") || "";
      src = src.replace("/mini/", "/").replace("/imagesmin/", "/images/");
      src = src.replace(/\?1(\d{10,})/, "?$1");
      if (src) coverUrl = toAbsoluteUrl(src);
    }

    let releaseDate = extractReleaseDateVfFromText(normalizeSpace(node.textContent));

    return {
      entryId: href,
      volumeNumber,
      volumeLabel,
      conflictVolumeNumber,
      editionType: inferEditionType(sectionKind, titleAttr, labelText),
      sectionTitle,
      pageUrl: toAbsoluteUrl(href),
      coverUrl,
      releaseDate,
    };
  }

  function parseEditionSections(editionBlock) {
    const sections = [];
    for (const h3 of editionBlock.querySelectorAll(":scope > h3")) {
      const title = normalizeSpace(h3.textContent);
      const container = h3.nextElementSibling;
      if (!container?.id) continue;
      const kind = classifySection(title);
      const volumes = [];
      for (const node of container.querySelectorAll(".unVol, .unChap")) {
        const parsed = parseVolumeNode(node, title, kind);
        if (parsed) volumes.push(parsed);
      }
      sections.push({
        id: container.id,
        title,
        kind,
        volumes,
        importable: kind !== "coffret",
        defaultChecked: defaultSectionChecked(kind),
      });
    }
    return sections;
  }

  function volumeConflictKey(volume) {
    const num = volume.conflictVolumeNumber ?? volume.volumeNumber;
    if (num != null) {
      return `num:${num}`;
    }
    return `label:${volume.entryId}`;
  }

  function formatConflictGroupTitle(candidates) {
    const num =
      candidates[0].conflictVolumeNumber ?? candidates[0].volumeNumber;
    if (num != null) {
      return `Tome ${formatVolumeNumberDisplay(num)}`;
    }
    return candidates[0].volumeLabel || "Hors-série";
  }

  /** @returns Entrées [clé, candidats] où plusieurs tomes partagent le même numéro. */
  function listVolumeNumberConflicts(picked) {
    const byKey = new Map();
    for (const vol of picked) {
      const key = volumeConflictKey(vol);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(vol);
    }
    return [...byKey.entries()].filter(([, list]) => list.length > 1);
  }

  function formatConflictCandidateLabel(candidate) {
    const detail =
      candidate.volumeLabel ||
      (candidate.volumeNumber != null
        ? `Vol. ${formatVolumeNumberDisplay(candidate.volumeNumber)}`
        : "Hors-série");
    const edition =
      candidate.editionType === "collector" ? " (Collector)" : "";
    return `${candidate.sectionTitle} — ${detail}${edition}`;
  }

  function buildPickedVolumesFromSelection(sections, selectedVolumeEntryIds) {
    const picked = [];
    for (const section of sections) {
      if (!section.importable) continue;
      for (const volume of section.volumes) {
        if (selectedVolumeEntryIds.has(volume.entryId)) {
          picked.push({
            ...volume,
            sectionId: section.id,
            sectionTitle: section.title,
          });
        }
      }
    }
    return picked;
  }

  function collectSelectedVolumes(sections, conflictChoices, selectedVolumeEntryIds) {
    const picked = buildPickedVolumesFromSelection(sections, selectedVolumeEntryIds);

    const byConflict = new Map();
    for (const volume of picked) {
      const key = volumeConflictKey(volume);
      if (!byConflict.has(key)) byConflict.set(key, []);
      byConflict.get(key).push(volume);
    }

    const result = [];
    for (const [key, candidates] of byConflict.entries()) {
      if (candidates.length === 1) {
        result.push(candidates[0]);
        continue;
      }
      const chosenId = conflictChoices[key];
      if (!chosenId) {
        continue;
      }
      const chosen = candidates.find((c) => c.entryId === chosenId);
      if (chosen) result.push(chosen);
    }

    return result.sort((a, b) => {
      const na = a.volumeNumber ?? 99999;
      const nb = b.volumeNumber ?? 99999;
      if (na !== nb) return na - nb;
      return (a.volumeLabel || "").localeCompare(b.volumeLabel || "");
    });
  }

  /** Styles inline — Nautiljon écrase les classes CSS du userscript. */
  const MG_VOL_TABLE_STYLES = {
    wrap: "margin-top:6px;border:1px solid #2d3340;border-radius:8px;background:#12141a;overflow:hidden",
    scroll: "display:block;max-height:min(240px,34vh);overflow-y:auto;overflow-x:hidden",
    table:
      "width:100%;border-collapse:collapse;font-size:0.82rem;table-layout:fixed;display:table !important",
    headRow: "background:#1e2230;color:#9aa0a6;display:table-row !important",
    th:
      "padding:7px 6px;font-weight:600;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.03em;border-bottom:1px solid #2d3340;white-space:nowrap;display:table-cell !important",
    bodyRow: "border-bottom:1px solid #252a36;display:table-row !important",
    td: "padding:6px;vertical-align:middle;display:table-cell !important",
    tdCheck: "width:30px;text-align:center;padding:6px 4px",
    tdName: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;color:#e8eaed",
    tdDate: "width:84px;text-align:center;color:#b4b8c0;font-size:0.78rem;font-variant-numeric:tabular-nums",
    tdPrice: "width:96px;text-align:right",
    priceInput:
      "width:58px;box-sizing:border-box;padding:4px 6px;border-radius:6px;border:1px solid #3d4452;background:#0f1117;color:#e8eaed;font-size:0.78rem;text-align:right",
    priceSuffix: "color:#6b7280;font-size:0.72rem;margin-left:3px",
    collector: "opacity:0.72;font-weight:400",
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function makeDraggablePanel(panel, handle) {
    let drag = null;
    const onMove = (event) => {
      if (!drag) return;
      const left = drag.left + (event.clientX - drag.x);
      const top = drag.top + (event.clientY - drag.y);
      panel.style.left = `${Math.max(8, left)}px`;
      panel.style.top = `${Math.max(8, top)}px`;
      panel.style.transform = "none";
    };
    const onUp = () => {
      drag = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    handle.addEventListener("mousedown", (event) => {
      if (event.target.closest("button, input, select, textarea, a, label")) return;
      const rect = panel.getBoundingClientRect();
      drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      panel.style.position = "fixed";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function createMetadataBlock(meta, catalog) {
    const title = extractTitle();
    const genres = extractTaggedListFromDoc(document, ["Genres", "Genre"]);
    const themes = extractTaggedListFromDoc(document, ["Thèmes", "Thème"]);
    const synopsis = extractSynopsis() || "";
    const coverUrl = extractCoverUrl() || "";
    const publisherVf = resolvePublisherVf(meta) || "";
    const defaultPrice = parsePriceEur(meta["Prix"] || "");
    const vfRaw = meta["Nb volumes VF"] || meta["Nb chapitres VF"] || "";
    const voRaw = meta["Nb volumes VO"] || meta["Nb chapitres VO"] || "";
    const vfCount = parseVfVolumeCount(vfRaw);
    const voMatch = voRaw.match(/\d+/);
    const readingStatus = mapReadingStatusFromVfMeta(vfRaw) || "";
    const isLn = window.location.pathname.includes("/light_novels/");
    let priceFormat = mapPriceFormat(
      isLn ? "Light Novel" : meta["Type volume"] || "Broché",
    );
    if (
      catalog.chapter.available &&
      meta["Webcomic"] === "Oui" &&
      !String(meta["Type volume"] || "").toLowerCase().includes("broch")
    ) {
      priceFormat = "numerique";
    }

    const block = document.createElement("details");
    block.id = "mg-metadata-block";
    block.open = true;
    block.style.cssText =
      "margin:0 0 12px;padding:10px 12px;border-radius:10px;border:1px solid #2d3340;background:#12141a";
    block.innerHTML = `
      <summary style="cursor:pointer;font-weight:600;margin-bottom:10px">Fiche série — vérifiez / corrigez avant envoi</summary>
      <div style="display:grid;grid-template-columns:7fr 3fr;gap:8px;font-size:0.85rem;margin-bottom:8px">
        <label style="display:flex;flex-direction:column;gap:4px">Titre
          <input id="mg-meta-title" type="text" value="${escapeHtml(title)}" style="padding:6px 8px;border-radius:6px;border:1px solid #3d4452;background:#0f1117;color:#e8eaed"/>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px">Démographie
          <input id="mg-meta-demographic" type="text" value="${escapeHtml(meta["Type"] || "")}" placeholder="Seinen, Shōnen…" style="padding:6px 8px;border-radius:6px;border:1px solid #3d4452;background:#0f1117;color:#e8eaed"/>
        </label>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem;margin-bottom:8px">
        <label style="display:flex;flex-direction:column;gap:4px">Prix défaut (€)
          <input id="mg-meta-default-price" type="text" value="${escapeHtml(formatPriceInputValue(defaultPrice))}" title="Modifiez puis quittez le champ : les tomes non édités reprennent ce tarif (ex. 4,99 Kindle)" style="padding:6px 8px;border-radius:6px;border:1px solid #3d4452;background:#0f1117;color:#e8eaed"/>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px">Format prix
          <select id="mg-meta-price-format" style="padding:6px 8px;border-radius:6px;border:1px solid #3d4452;background:#0f1117;color:#e8eaed">
            <option value="broche" ${priceFormat === "broche" ? "selected" : ""}>Broché</option>
            <option value="numerique" ${priceFormat === "numerique" ? "selected" : ""}>Numérique</option>
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px">Nb tomes VF
          <input id="mg-meta-vf-count" type="number" min="0" value="${vfCount ?? ""}" style="padding:6px 8px;border-radius:6px;border:1px solid #3d4452;background:#0f1117;color:#e8eaed"/>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px">Nb tomes VO
          <input id="mg-meta-vo-count" type="number" min="0" value="${voMatch ? voMatch[0] : ""}" style="padding:6px 8px;border-radius:6px;border:1px solid #3d4452;background:#0f1117;color:#e8eaed"/>
        </label>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem">
        <label style="grid-column:1/-1;display:flex;flex-direction:column;gap:4px">Genres (virgules)
          <input id="mg-meta-genres" type="text" value="${escapeHtml(genres.join(", "))}" style="padding:6px 8px;border-radius:6px;border:1px solid #3d4452;background:#0f1117;color:#e8eaed"/>
        </label>
        <label style="grid-column:1/-1;display:flex;flex-direction:column;gap:4px">Thèmes (virgules)
          <input id="mg-meta-themes" type="text" value="${escapeHtml(themes.join(", "))}" style="padding:6px 8px;border-radius:6px;border:1px solid #3d4452;background:#0f1117;color:#e8eaed"/>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px">Éditeur VF
          <input id="mg-meta-publisher" type="text" value="${escapeHtml(publisherVf)}" style="padding:6px 8px;border-radius:6px;border:1px solid #3d4452;background:#0f1117;color:#e8eaed"/>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px">Statut VF
          <select id="mg-meta-status" style="padding:6px 8px;border-radius:6px;border:1px solid #3d4452;background:#0f1117;color:#e8eaed">
            <option value="">—</option>
            <option value="ongoing" ${readingStatus === "ongoing" ? "selected" : ""}>En cours</option>
            <option value="completed" ${readingStatus === "completed" ? "selected" : ""}>Terminé</option>
            <option value="on_hold" ${readingStatus === "on_hold" ? "selected" : ""}>En pause</option>
            <option value="dropped" ${readingStatus === "dropped" ? "selected" : ""}>Abandonné</option>
          </select>
        </label>
        <label style="grid-column:1/-1;display:flex;flex-direction:column;gap:4px">Synopsis
          <textarea id="mg-meta-synopsis" rows="3" style="padding:6px 8px;border-radius:6px;border:1px solid #3d4452;background:#0f1117;color:#e8eaed;resize:vertical">${escapeHtml(synopsis)}</textarea>
        </label>
        <label style="grid-column:1/-1;display:flex;flex-direction:column;gap:4px">URL couverture
          <input id="mg-meta-cover" type="text" value="${escapeHtml(coverUrl)}" style="padding:6px 8px;border-radius:6px;border:1px solid #3d4452;background:#0f1117;color:#e8eaed"/>
        </label>
      </div>`;
    return block;
  }

  function readMetadataOverrides(panel) {
    const read = (selector) => panel.querySelector(selector);
    const vfRaw = read("#mg-meta-vf-count")?.value.trim();
    const voRaw = read("#mg-meta-vo-count")?.value.trim();
    return {
      title: read("#mg-meta-title")?.value.trim() || null,
      defaultPrice: parsePriceInput(read("#mg-meta-default-price")?.value || ""),
      genres: splitTags(read("#mg-meta-genres")?.value || ""),
      themes: splitTags(read("#mg-meta-themes")?.value || ""),
      publisherVf: read("#mg-meta-publisher")?.value.trim() || null,
      synopsis: read("#mg-meta-synopsis")?.value.trim() || null,
      coverUrl: read("#mg-meta-cover")?.value.trim() || null,
      volumesVfCount: vfRaw ? Number(vfRaw) : null,
      volumesVoTotal: voRaw ? Number(voRaw) : null,
      readingStatus: read("#mg-meta-status")?.value.trim() || null,
      demographicType: read("#mg-meta-demographic")?.value.trim() || null,
      priceFormat: read("#mg-meta-price-format")?.value.trim() || null,
    };
  }

  function mergeMetadataIntoPayload(payload, overrides) {
    if (overrides.title) payload.title = overrides.title;
    if (overrides.defaultPrice != null) payload.defaultPrice = overrides.defaultPrice;
    if (overrides.genres?.length) payload.genres = overrides.genres;
    if (overrides.themes?.length) payload.themes = overrides.themes;
    if (overrides.publisherVf) payload.publisherVf = overrides.publisherVf;
    if (overrides.synopsis) payload.synopsis = overrides.synopsis;
    if (overrides.coverUrl) payload.coverUrl = overrides.coverUrl;
    if (overrides.volumesVfCount != null && !Number.isNaN(overrides.volumesVfCount)) {
      payload.volumesVfCount = overrides.volumesVfCount;
    }
    if (overrides.volumesVoTotal != null && !Number.isNaN(overrides.volumesVoTotal)) {
      payload.volumesVoTotal = overrides.volumesVoTotal;
    }
    if (overrides.readingStatus) payload.readingStatus = overrides.readingStatus;
    if (overrides.demographicType) payload.demographicType = overrides.demographicType;
    if (overrides.priceFormat) payload.priceFormat = overrides.priceFormat;
    return payload;
  }

  function showImportSelectionModal(catalog, options = { purpose: "export" }) {
    return new Promise((resolve, reject) => {
      const { chapter, volume, meta } = catalog;
      if (!chapter.available && !volume.available) {
        reject(new Error("Aucun chapitre ni tome VF détecté sur cette fiche."));
        return;
      }

      const onlyChapter = chapter.available && !volume.available;
      const onlyVolume = volume.available && !chapter.available;
      let chapterEditionId = chapter.defaultEditionId;
      let volumeEditionId = volume.defaultEditionId;

      const overlay = document.createElement("div");
      overlay.id = "mangatheque-import-modal";
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:999999;pointer-events:none;font:14px/1.45 Segoe UI,sans-serif;color:#e8eaed;";

      const panel = document.createElement("div");
      panel.style.cssText =
        "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(720px,calc(100vw - 24px));max-height:min(90vh,780px);display:flex;flex-direction:column;pointer-events:auto;background:#1a1d26;border:1px solid #2d3340;border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,.55);overflow:hidden;";

      const seriesTitle = extractTitle() || "Sans titre";
      const header = document.createElement("header");
      header.className = "mg-drag-handle";
      header.style.cssText =
        "flex:0 0 auto;padding:12px 16px 10px;border-bottom:1px solid #2d3340;background:#1a1d26;cursor:move;user-select:none;z-index:2;";
      header.innerHTML = `
        <h2 id="mg-modal-title" style="margin:0 0 4px;font-size:1.05rem;line-height:1.3">Import Mangathèque — ${escapeHtml(seriesTitle)}</h2>
        <p style="margin:0;color:#9aa0a6;font-size:0.82rem;line-height:1.4">Glissez cette barre pour déplacer le panneau. Le contenu défile au centre, les actions restent visibles en bas.</p>`;
      makeDraggablePanel(panel, header);

      const scrollBody = document.createElement("div");
      scrollBody.className = "mg-modal-body";
      scrollBody.style.cssText =
        "flex:1 1 auto;min-height:0;overflow-y:auto;padding:12px 16px;overscroll-behavior:contain;";

      const footer = document.createElement("footer");
      footer.className = "mg-modal-footer";
      footer.style.cssText =
        "flex:0 0 auto;padding:10px 16px 14px;border-top:1px solid #2d3340;background:#1a1d26;z-index:2;";

      panel.append(header, scrollBody, footer);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      function syncModalTitleFromForm() {
        const titleInput = panel.querySelector("#mg-meta-title");
        const titleEl = panel.querySelector("#mg-modal-title");
        if (!(titleEl instanceof HTMLElement)) return;
        const label =
          titleInput instanceof HTMLInputElement && titleInput.value.trim()
            ? titleInput.value.trim()
            : seriesTitle;
        titleEl.textContent = `Import Mangathèque — ${label}`;
      }

      const volumeDetailsCache = new Map();
      let prefetchToken = 0;

      function getDefaultCatalogPrice() {
        const input = panel.querySelector("#mg-meta-default-price");
        if (input instanceof HTMLInputElement) {
          const parsed = parsePriceInput(input.value);
          if (parsed != null) {
            return parsed;
          }
        }
        return parsePriceEur(meta["Prix"] || "");
      }

      /** @description Applique le prix défaut série aux tomes non modifiés manuellement. */
      function propagateDefaultPriceToVolumes() {
        const price = getDefaultCatalogPrice();
        if (price == null) {
          return;
        }

        for (const input of panel.querySelectorAll(".mg-vol-price")) {
          if (!(input instanceof HTMLInputElement)) {
            continue;
          }
          if (input.dataset.userEdited === "true") {
            continue;
          }
          if (input.dataset.editionType === "collector") {
            continue;
          }
          input.value = formatPriceInputValue(price);
          input.placeholder = `${formatPriceInputValue(price)} €`;
        }
      }

      const dragHandle = header;

      scrollBody.appendChild(createMetadataBlock(meta, catalog));

      const profilesBlock = document.createElement("div");
      profilesBlock.style.marginBottom = "12px";
      scrollBody.appendChild(profilesBlock);

      const ownershipBlock = document.createElement("div");
      ownershipBlock.id = "mg-ownership-block";
      ownershipBlock.style.cssText =
        "margin:0 0 12px;padding:10px 12px;border-radius:10px;border:1px solid #2d3340;background:#12141a";
      ownershipBlock.innerHTML = `
        <p style="margin:0 0 10px;font-weight:600">Appartenance (tomes / chapitres importés)</p>
        <p style="margin:0 0 8px;font-size:0.82rem;color:#9aa0a6">Achat physique — co-propriété possible :</p>`;

      const purchaseWrap = document.createElement("div");
      purchaseWrap.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;margin:0 0 12px 2px";
      for (const ownerName of OWNER_OPTIONS) {
        const purchaseLabel = document.createElement("label");
        purchaseLabel.style.cssText =
          "display:flex;gap:6px;cursor:pointer;font-size:0.88rem;opacity:.55";
        purchaseLabel.innerHTML = `<input type="checkbox" class="mg-purchase-owner" value="${ownerName}" disabled/> <span>${ownerName}</span>`;
        purchaseWrap.appendChild(purchaseLabel);
      }
      ownershipBlock.appendChild(purchaseWrap);

      const mihonHead = document.createElement("label");
      mihonHead.style.cssText =
        "display:flex;gap:8px;cursor:pointer;align-items:center;margin-bottom:8px;opacity:.55";
      mihonHead.innerHTML = `
        <input type="checkbox" id="mg-mihon-enabled" class="mg-mihon-enabled" disabled/>
        <strong style="color:#22d3ee">Mihon</strong>`;
      ownershipBlock.appendChild(mihonHead);

      const mihonHint = document.createElement("p");
      mihonHint.style.cssText = "margin:0 0 8px;font-size:0.82rem;color:#9aa0a6";
      mihonHint.textContent = "Compte Mihon (exclusif avec achat physique) :";
      ownershipBlock.appendChild(mihonHint);

      const mihonOwnersWrap = document.createElement("div");
      mihonOwnersWrap.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;margin-left:2px";
      for (const [index, ownerName] of OWNER_OPTIONS.entries()) {
        const ownerLabel = document.createElement("label");
        ownerLabel.style.cssText =
          "display:flex;gap:6px;cursor:pointer;font-size:0.88rem;opacity:.55";
        ownerLabel.innerHTML = `<input type="radio" name="mg-mihon-owner" class="mg-mihon-owner" value="${ownerName}" ${index === 0 ? "checked" : ""} disabled/> <span>${ownerName}</span>`;
        mihonOwnersWrap.appendChild(ownerLabel);
      }
      ownershipBlock.appendChild(mihonOwnersWrap);
      scrollBody.appendChild(ownershipBlock);

      const hint = document.createElement("p");
      hint.style.cssText = "margin:0 0 12px;color:#9aa0a6;font-size:0.85rem";
      scrollBody.appendChild(hint);

      const sectionsBlock = document.createElement("div");
      sectionsBlock.style.marginBottom = "14px";
      scrollBody.appendChild(sectionsBlock);

      const conflictsBlock = document.createElement("div");
      conflictsBlock.style.marginBottom = "14px";
      scrollBody.appendChild(conflictsBlock);

      const actions = document.createElement("div");
      actions.style.cssText =
        "display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;";
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.textContent = "Annuler";
      cancelBtn.style.cssText =
        "padding:8px 14px;border-radius:8px;border:1px solid #2d3340;background:#12141a;color:#e8eaed;cursor:pointer;";

      const exportBtn = document.createElement("button");
      exportBtn.type = "button";
      exportBtn.textContent = "Préparer l'export JSON";
      exportBtn.style.cssText =
        "padding:8px 14px;border-radius:8px;border:1px solid #2d3340;background:#12141a;color:#e8eaed;cursor:pointer;";
      exportBtn.style.display = options.purpose === "export" ? "inline-block" : "none";

      const reviewBtn = document.createElement("button");
      reviewBtn.type = "button";
      reviewBtn.textContent = "Envoi + contrôle app";
      reviewBtn.title = "Ouvre la modale Mangathèque pour vérifier avant enregistrement";
      reviewBtn.style.cssText =
        "padding:8px 14px;border-radius:8px;border:0;background:#6366f1;color:#fff;font-weight:600;cursor:pointer;";
      reviewBtn.style.display = options.purpose === "app" ? "inline-block" : "none";

      const directBtn = document.createElement("button");
      directBtn.type = "button";
      directBtn.textContent = "Envoi direct";
      directBtn.title = "Crée la série immédiatement sans modale de contrôle";
      directBtn.style.cssText =
        "padding:8px 14px;border-radius:8px;border:0;background:#059669;color:#fff;font-weight:600;cursor:pointer;";
      directBtn.style.display = options.purpose === "app" ? "inline-block" : "none";

      actions.append(cancelBtn, exportBtn, reviewBtn, directBtn);
      footer.appendChild(actions);

      const conflictChoices = { chapter: {}, volume: {} };
      const profileToggle = { chapter: null, volume: null };

      function createProfileToggle(profile, label, defaultChecked) {
        if (!profile.available) return null;
        const wrap = document.createElement("div");
        wrap.style.cssText =
          "margin:0 0 10px;padding:10px 12px;border-radius:10px;border:1px solid #2d3340;background:#12141a";
        const head = document.createElement("label");
        head.style.cssText = "display:flex;gap:10px;cursor:pointer;align-items:flex-start";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "mg-profile-toggle";
        input.dataset.kind = profile.contentKind;
        input.checked = defaultChecked;
        profileToggle[profile.contentKind] = input;
        const text = document.createElement("span");
        text.innerHTML = `<strong>${label}</strong><br/><span style="color:#9aa0a6;font-size:0.88rem">${formatProfileSummary(profile)}</span>`;
        head.append(input, text);
        wrap.appendChild(head);

        if (profile.editions.length > 1) {
          const sub = document.createElement("div");
          sub.style.cssText = "margin:8px 0 0 28px";
          sub.innerHTML = `<p style="margin:0 0 6px;font-size:0.82rem;color:#9aa0a6">Édition</p>`;
          for (const edition of profile.editions) {
            const el = document.createElement("label");
            el.style.cssText = "display:flex;gap:8px;margin:4px 0;cursor:pointer;font-size:0.88rem";
            const selectedId =
              profile.contentKind === "chapter" ? chapterEditionId : volumeEditionId;
            el.innerHTML = `<input type="radio" name="mg-edition-${profile.contentKind}" value="${edition.id}" ${edition.id === selectedId ? "checked" : ""}/> <span>${formatEditionChoiceLabel(edition)}</span>`;
            sub.appendChild(el);
          }
          wrap.appendChild(sub);
        }
        return wrap;
      }

      const chapterDefault =
        onlyChapter || (chapter.available && (meta["Webcomic"] === "Oui" || !volume.available));
      const volumeDefault = onlyVolume;

      const chapterEl = createProfileToggle(chapter, "Chapitres VF", chapterDefault);
      const volumeEl = createProfileToggle(volume, "Tomes VF", volumeDefault);
      if (chapterEl) profilesBlock.appendChild(chapterEl);
      if (volumeEl) profilesBlock.appendChild(volumeEl);

      function getEditionForKind(kind) {
        const profile = kind === "chapter" ? chapter : volume;
        const editionId = kind === "chapter" ? chapterEditionId : volumeEditionId;
        return (
          profile.editions.find((edition) => edition.id === editionId) ||
          profile.editions[0] ||
          null
        );
      }

      function isProfileEnabled(kind) {
        return Boolean(profileToggle[kind]?.checked);
      }

      function hasImportableProfileSelected() {
        return isProfileEnabled("chapter") || isProfileEnabled("volume");
      }

      function isMihonModeActive() {
        const enabledInput = panel.querySelector("#mg-mihon-enabled");
        return (
          enabledInput instanceof HTMLInputElement &&
          enabledInput.checked &&
          !enabledInput.disabled
        );
      }

      function setLabelOpacity(input, active) {
        if (input?.parentElement) {
          input.parentElement.style.opacity = active ? "1" : "0.55";
        }
      }

      function syncOwnershipBlockState() {
        const canConfigure =
          (chapter.available || volume.available) && hasImportableProfileSelected();
        ownershipBlock.style.display =
          chapter.available || volume.available ? "block" : "none";
        ownershipBlock.style.opacity = canConfigure ? "1" : "0.55";

        const enabledInput = panel.querySelector("#mg-mihon-enabled");
        const purchaseInputs = panel.querySelectorAll(".mg-purchase-owner");
        const mihonInputs = panel.querySelectorAll(".mg-mihon-owner");
        const mihonActive = isMihonModeActive();

        if (enabledInput instanceof HTMLInputElement) {
          enabledInput.disabled = !canConfigure || purchaseInputs.length === 0;
          setLabelOpacity(enabledInput, canConfigure && !enabledInput.disabled);
        }

        for (const input of purchaseInputs) {
          if (!(input instanceof HTMLInputElement)) continue;
          input.disabled = !canConfigure || mihonActive;
          setLabelOpacity(input, canConfigure && !input.disabled);
        }

        for (const input of mihonInputs) {
          if (!(input instanceof HTMLInputElement)) continue;
          input.disabled = !canConfigure || !mihonActive;
          setLabelOpacity(input, canConfigure && mihonActive);
        }

        if (!canConfigure && enabledInput instanceof HTMLInputElement) {
          enabledInput.checked = false;
        }
      }

      function readOwnershipFromPanel() {
        const mihonEnabled = panel.querySelector("#mg-mihon-enabled");
        if (
          mihonEnabled instanceof HTMLInputElement &&
          mihonEnabled.checked &&
          !mihonEnabled.disabled
        ) {
          const selected = panel.querySelector('input[name="mg-mihon-owner"]:checked');
          return {
            ownerNames: [],
            mihonOwnerName:
              selected instanceof HTMLInputElement ? selected.value : null,
          };
        }

        const ownerNames = Array.from(
          panel.querySelectorAll(".mg-purchase-owner:checked"),
        )
          .map((input) => (input instanceof HTMLInputElement ? input.value : ""))
          .filter(Boolean);
        return { ownerNames, mihonOwnerName: null };
      }

      function clearPurchaseOwners() {
        for (const input of panel.querySelectorAll(".mg-purchase-owner")) {
          if (input instanceof HTMLInputElement) input.checked = false;
        }
      }

      panel.querySelector("#mg-mihon-enabled")?.addEventListener("change", (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.checked) {
          clearPurchaseOwners();
        }
        syncOwnershipBlockState();
      });

      for (const input of panel.querySelectorAll(".mg-purchase-owner")) {
        input.addEventListener("change", (event) => {
          const target = event.target;
          if (!(target instanceof HTMLInputElement) || !target.checked) {
            syncOwnershipBlockState();
            return;
          }
          const mihonInput = panel.querySelector("#mg-mihon-enabled");
          if (mihonInput instanceof HTMLInputElement) {
            mihonInput.checked = false;
          }
          syncOwnershipBlockState();
        });
      }

      function getSelectedVolumeEntryIds(kind) {
        return new Set(
          Array.from(
            panel.querySelectorAll(`.mg-volume-item[data-kind="${kind}"]:checked`),
          ).map((el) => el.getAttribute("data-entry-id")),
        );
      }

      function readVolumeOverridesFromPanel() {
        const overrides = {};
        for (const input of panel.querySelectorAll(".mg-vol-price")) {
          const entryId = input.getAttribute("data-entry-id");
          if (!entryId) continue;
          const price = parsePriceInput(input.value);
          if (price != null) {
            overrides[entryId] = { catalogPrice: price };
          }
        }
        return overrides;
      }

      function updateVolumeRowInPanel(entryId, details, vol) {
        const dateEl = panel.querySelector(`.mg-vol-date[data-entry-id="${entryId}"]`);
        const priceInput = panel.querySelector(`.mg-vol-price[data-entry-id="${entryId}"]`);
        const releaseDate = details?.releaseDate || vol?.releaseDate || null;
        const catalogPrice =
          details?.catalogPrice ??
          vol?.catalogPrice ??
          (vol?.editionType === "collector" ? null : getDefaultCatalogPrice());

        if (dateEl) {
          dateEl.textContent = releaseDate ? formatIsoDateFr(releaseDate) : "…";
          dateEl.title = releaseDate ? "Date de parution VF" : "Date VF en cours de récupération";
        }
        if (priceInput instanceof HTMLInputElement && !priceInput.dataset.userEdited) {
          if (catalogPrice != null) {
            priceInput.value = formatPriceInputValue(catalogPrice);
            priceInput.placeholder = `${formatPriceInputValue(catalogPrice)} €`;
          } else {
            const fallback = getDefaultCatalogPrice();
            if (fallback != null) {
              priceInput.placeholder = `${formatPriceInputValue(fallback)} € (indicatif)`;
            }
          }
        }
      }

      function listVisibleVolumesForPrefetch() {
        const volumes = [];
        for (const kind of ["chapter", "volume"]) {
          if (!isProfileEnabled(kind)) continue;
          const edition = getEditionForKind(kind);
          if (!edition?.block || edition.metadataOnly) continue;
          const sections = parseEditionSections(edition.block);
          for (const section of sections) {
            if (!section.importable) continue;
            volumes.push(...section.volumes);
          }
        }
        return [...new Map(volumes.map((vol) => [vol.entryId, vol])).values()];
      }

      async function prefetchVolumeDetailsForPanel() {
        const token = ++prefetchToken;
        const volumes = listVisibleVolumesForPrefetch();
        if (volumes.length === 0) return;

        for (const vol of volumes) {
          if (token !== prefetchToken) return;
          updateVolumeRowInPanel(vol.entryId, volumeDetailsCache.get(vol.entryId), vol);
        }

        const pending = volumes.filter((vol) => {
          const cached = volumeDetailsCache.get(vol.entryId);
          return !cached?.releaseDate || cached.catalogPrice == null;
        });
        if (pending.length === 0) return;

        const batchCount = Math.ceil(pending.length / VOLUME_FETCH_CONCURRENCY);
        for (let batch = 0; batch < batchCount; batch++) {
          if (token !== prefetchToken) return;
          const chunk = pending.slice(
            batch * VOLUME_FETCH_CONCURRENCY,
            (batch + 1) * VOLUME_FETCH_CONCURRENCY,
          );
          await Promise.all(
            chunk.map(async (vol) => {
              try {
                const html = await fetchVolumePage(vol.pageUrl, 0, 3);
                const details = extractVolumeDetailsFromHtml(html);
                volumeDetailsCache.set(vol.entryId, {
                  releaseDate: details.releaseDate || vol.releaseDate || null,
                  catalogPrice: details.catalogPrice ?? vol.catalogPrice ?? null,
                  coverUrl: details.coverUrl || vol.coverUrl || null,
                });
                if (token !== prefetchToken) return;
                updateVolumeRowInPanel(vol.entryId, volumeDetailsCache.get(vol.entryId), vol);
              } catch {
                volumeDetailsCache.set(vol.entryId, {
                  releaseDate: vol.releaseDate || null,
                  catalogPrice: vol.catalogPrice ?? null,
                  coverUrl: vol.coverUrl || null,
                });
              }
            }),
          );
          if (batch < batchCount - 1) {
            await new Promise((resolve) => setTimeout(resolve, VOLUME_FETCH_BATCH_DELAY_MS));
          }
        }
      }

      function updateHint() {
        const parts = [];
        if (isProfileEnabled("chapter")) parts.push("chapitres");
        if (isProfileEnabled("volume")) parts.push("tomes");
        if (parts.length === 0) {
          hint.textContent = "Cochez au moins un type de contenu à importer.";
          return;
        }
        hint.textContent = `Sélectionnez les ${parts.join(" et ")} ci-dessous. Doublons de numéro : choisissez lequel conserver.`;
      }

      function renderProfileSections(kind) {
        const profile = kind === "chapter" ? chapter : volume;
        const edition = getEditionForKind(kind);
        const containerId = `mg-details-${kind}`;
        let container = panel.querySelector(`#${containerId}`);
        if (!container) {
          container = document.createElement("div");
          container.id = containerId;
          sectionsBlock.appendChild(container);
        }
        container.innerHTML = "";
        if (!isProfileEnabled(kind)) {
          container.style.display = "none";
          return;
        }
        container.style.display = "block";
        const vfHint =
          profile.vfCount != null && profile.vfCount > 0
            ? ` · ${profile.vfCount} VF parus cochés par défaut`
            : "";
        container.innerHTML = `<p style="margin:0 0 8px;font-weight:600">${kind === "chapter" ? "Chapitres" : "Tomes"} — détail <span style="font-weight:400;color:#9aa0a6;font-size:0.82rem">(date VF · prix € modifiable${vfHint})</span></p>`;

        if (!edition || edition.metadataOnly) {
          container.innerHTML += `
            <p style="margin:0;color:#9aa0a6;font-size:0.9rem;line-height:1.5">
              VF : <strong>${profile.vfRaw || "—"}</strong><br/>
              VO : <strong>${profile.voRaw || "—"}</strong><br/>
              Liste non disponible sur Nautiljon — import des métadonnées (compteur, statut, couverture).
            </p>`;
          return;
        }
        if (!edition.block) {
          container.innerHTML += `<p style="color:#f87171">Bloc édition introuvable.</p>`;
          return;
        }

        const sections = parseEditionSections(edition.block);
        for (const section of sections) {
          if (!section.importable) {
            const p = document.createElement("p");
            p.style.cssText = "margin:4px 0;color:#9aa0a6;font-size:0.85rem";
            p.textContent = `${section.title} (${section.volumes.length}) — non importé (coffret)`;
            container.appendChild(p);
            continue;
          }
          const wrap = document.createElement("div");
          wrap.style.marginBottom = "12px";
          const sectionKey = `${kind}:${section.id}`;
          const header = document.createElement("label");
          header.style.cssText =
            "display:flex;gap:8px;margin:6px 0;cursor:pointer;align-items:flex-start;";
          header.innerHTML = `<input type="checkbox" class="mg-section mg-section-pickable" data-kind="${kind}" data-section-id="${sectionKey}"/> <span><strong>${section.title}</strong> (${section.volumes.length}) — <span class="mg-section-count" data-section-id="${sectionKey}"></span></span>`;
          wrap.appendChild(header);

          const unitCol = kind === "chapter" ? "Chapitre" : "Tome";
          const tableWrap = document.createElement("div");
          tableWrap.style.cssText = MG_VOL_TABLE_STYLES.wrap;
          const tableScroll = document.createElement("div");
          tableScroll.style.cssText = MG_VOL_TABLE_STYLES.scroll;

          const table = document.createElement("table");
          table.style.cssText = MG_VOL_TABLE_STYLES.table;
          table.setAttribute("role", "grid");

          const colgroup = document.createElement("colgroup");
          colgroup.innerHTML =
            '<col style="width:30px"><col><col style="width:84px"><col style="width:96px">';
          table.appendChild(colgroup);

          const thead = document.createElement("thead");
          thead.style.cssText = "display:table-header-group !important";
          const headRow = document.createElement("tr");
          headRow.style.cssText = MG_VOL_TABLE_STYLES.headRow;
          for (const [label, align] of [
            ["", "center"],
            [unitCol, "left"],
            ["Date VF", "center"],
            ["Prix", "right"],
          ]) {
            const th = document.createElement("th");
            th.scope = "col";
            th.textContent = label;
            th.style.cssText = `${MG_VOL_TABLE_STYLES.th};text-align:${align}`;
            headRow.appendChild(th);
          }
          thead.appendChild(headRow);
          table.appendChild(thead);

          const tbody = document.createElement("tbody");
          tbody.style.cssText = "display:table-row-group !important";

          for (const vol of section.volumes) {
            const row = document.createElement("tr");
            row.style.cssText = MG_VOL_TABLE_STYLES.bodyRow;

            const tdCheck = document.createElement("td");
            tdCheck.style.cssText = `${MG_VOL_TABLE_STYLES.td};${MG_VOL_TABLE_STYLES.tdCheck}`;
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "mg-volume-item";
            checkbox.dataset.kind = kind;
            checkbox.dataset.sectionId = sectionKey;
            checkbox.dataset.entryId = vol.entryId;
            checkbox.id = `mg-vol-${kind}-${vol.entryId.replace(/[^\w-]/g, "_")}`;
            checkbox.style.margin = "0";
            if (
              shouldSelectVolumeByDefault(
                vol,
                profile.vfCount,
                section.defaultChecked,
              )
            ) {
              checkbox.checked = true;
            }
            const beyondVf = isVolumeBeyondVfCount(vol, profile.vfCount);
            if (beyondVf) {
              row.style.opacity = "0.52";
              row.title = `Annoncé sur Nautiljon — hors compteur VF (${profile.vfCount} paru${profile.vfCount > 1 ? "s" : ""})`;
            }
            tdCheck.appendChild(checkbox);
            row.appendChild(tdCheck);

            const name =
              kind === "chapter" && vol.volumeNumber != null
                ? `Ch. ${vol.volumeNumber}`
                : formatVolumeListLabel(vol);
            const tdName = document.createElement("td");
            tdName.style.cssText = `${MG_VOL_TABLE_STYLES.td};${MG_VOL_TABLE_STYLES.tdName}`;
            const titleLine = document.createElement("label");
            titleLine.htmlFor = checkbox.id;
            titleLine.style.cssText = "cursor:pointer;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
            if (vol.editionType === "collector") {
              titleLine.appendChild(document.createTextNode(`${name} `));
              const collectorSpan = document.createElement("span");
              collectorSpan.style.cssText = MG_VOL_TABLE_STYLES.collector;
              collectorSpan.textContent = "(Collector)";
              titleLine.appendChild(collectorSpan);
            } else {
              titleLine.textContent = name;
            }
            tdName.appendChild(titleLine);
            row.appendChild(tdName);

            const tdDate = document.createElement("td");
            tdDate.style.cssText = `${MG_VOL_TABLE_STYLES.td};${MG_VOL_TABLE_STYLES.tdDate}`;
            const dateEl = document.createElement("span");
            dateEl.className = "mg-vol-date";
            dateEl.dataset.entryId = vol.entryId;
            dateEl.textContent = vol.releaseDate ? formatIsoDateFr(vol.releaseDate) : "…";
            dateEl.title = "Date de parution VF";
            tdDate.appendChild(dateEl);
            row.appendChild(tdDate);

            const tdPrice = document.createElement("td");
            tdPrice.style.cssText = `${MG_VOL_TABLE_STYLES.td};${MG_VOL_TABLE_STYLES.tdPrice}`;
            const priceInput = document.createElement("input");
            priceInput.type = "text";
            priceInput.inputMode = "decimal";
            priceInput.className = "mg-vol-price";
            priceInput.dataset.entryId = vol.entryId;
            priceInput.dataset.editionType = vol.editionType || "classic";
            priceInput.placeholder = "—";
            priceInput.title = "Prix catalogue en euros";
            priceInput.style.cssText = MG_VOL_TABLE_STYLES.priceInput;
            priceInput.addEventListener("input", () => {
              priceInput.dataset.userEdited = "1";
            });
            priceInput.addEventListener("click", (event) => event.stopPropagation());
            tdPrice.appendChild(priceInput);
            const priceSuffix = document.createElement("span");
            priceSuffix.textContent = "€";
            priceSuffix.style.cssText = MG_VOL_TABLE_STYLES.priceSuffix;
            tdPrice.appendChild(priceSuffix);
            row.appendChild(tdPrice);

            tbody.appendChild(row);

            const cached = volumeDetailsCache.get(vol.entryId);
            updateVolumeRowInPanel(vol.entryId, cached, vol);
          }

          table.appendChild(tbody);
          tableScroll.appendChild(table);
          tableWrap.appendChild(tableScroll);
          wrap.appendChild(tableWrap);
          syncPickableSectionMaster(sectionKey);
          container.appendChild(wrap);
        }
      }

      function renderAll() {
        updateHint();
        sectionsBlock.innerHTML = "";
        if (isProfileEnabled("chapter")) renderProfileSections("chapter");
        if (isProfileEnabled("volume")) renderProfileSections("volume");
        updateSectionSelectionCounts();
        renderConflicts();
        updateImportButtonState();
        syncOwnershipBlockState();
        void prefetchVolumeDetailsForPanel();
      }

      function updateSectionSelectionCounts() {
        for (const counter of panel.querySelectorAll(".mg-section-count")) {
          const sectionId = counter.getAttribute("data-section-id");
          const items = panel.querySelectorAll(
            `.mg-volume-item[data-section-id="${sectionId}"]`,
          );
          const checked = Array.from(items).filter((item) => item.checked).length;
          counter.textContent = `${checked}/${items.length} sélectionné${checked > 1 ? "s" : ""}`;
        }
      }

      function syncPickableSectionMaster(sectionId) {
        const items = panel.querySelectorAll(
          `.mg-volume-item[data-section-id="${sectionId}"]`,
        );
        const master = panel.querySelector(
          `.mg-section-pickable[data-section-id="${sectionId}"]`,
        );
        if (!master || items.length === 0) return;
        const checkedCount = Array.from(items).filter((item) => item.checked).length;
        master.checked = checkedCount === items.length;
        master.indeterminate = checkedCount > 0 && checkedCount < items.length;
      }

      function readConflictChoicesFromPanel(kind) {
        panel
          .querySelectorAll(`input[type="radio"][name^="conf-${kind}:"]:checked`)
          .forEach((input) => {
            const name = input.getAttribute("name") || "";
            conflictChoices[kind][name.replace(`conf-${kind}:`, "")] = input.value;
          });
      }

      function hasUnresolvedConflictsForKind(kind) {
        if (!isProfileEnabled(kind)) return false;
        const edition = getEditionForKind(kind);
        if (!edition || edition.metadataOnly || !edition.block) return false;
        const sections = parseEditionSections(edition.block);
        const picked = buildPickedVolumesFromSelection(
          sections,
          getSelectedVolumeEntryIds(kind),
        );
        readConflictChoicesFromPanel(kind);
        const conflicts = listVolumeNumberConflicts(picked);
        return conflicts.some(([key]) => !conflictChoices[kind][key]);
      }

      function hasUnresolvedConflicts() {
        return hasUnresolvedConflictsForKind("chapter") || hasUnresolvedConflictsForKind("volume");
      }

      function updateImportButtonState() {
        const blocked = hasUnresolvedConflicts();
        const noneSelected = !isProfileEnabled("chapter") && !isProfileEnabled("volume");
        const disabled = blocked || noneSelected;
        for (const btn of [reviewBtn, directBtn, exportBtn]) {
          btn.disabled = disabled;
          btn.style.opacity = disabled ? "0.5" : "1";
          btn.style.cursor = disabled ? "not-allowed" : "pointer";
        }
      }

      function renderConflictsForKind(kind) {
        if (!isProfileEnabled(kind)) return;
        const edition = getEditionForKind(kind);
        if (!edition || edition.metadataOnly || !edition.block) return;
        const sections = parseEditionSections(edition.block);
        const picked = buildPickedVolumesFromSelection(
          sections,
          getSelectedVolumeEntryIds(kind),
        );
        readConflictChoicesFromPanel(kind);
        const conflicts = listVolumeNumberConflicts(picked);
        if (conflicts.length === 0) return;

        const block = document.createElement("div");
        block.style.cssText =
          "margin-bottom:12px;padding:12px;border-radius:10px;border:1px solid #b45309;background:rgba(180,83,9,.18);";
        block.innerHTML = `
          <p style="margin:0 0 4px;font-weight:600;color:#fbbf24">⚠️ Doublons — ${kind === "chapter" ? "chapitres" : "tomes"}</p>
          <p style="margin:0 0 10px;font-size:0.85rem;color:#fcd34d">Même numéro coché dans plusieurs sections.</p>`;
        for (const [key, candidates] of conflicts) {
          const wrap = document.createElement("div");
          wrap.style.marginBottom = "10px";
          wrap.innerHTML = `<p style="margin:0 0 4px;font-weight:600">${formatConflictGroupTitle(candidates)}</p>`;
          for (const candidate of candidates) {
            const label = document.createElement("label");
            label.style.cssText =
              "display:flex;gap:8px;margin:3px 0 3px 12px;cursor:pointer;font-size:0.9rem";
            const fullKey = `${kind}:${key}`;
            const checked = conflictChoices[kind][key] === candidate.entryId;
            label.innerHTML = `<input type="radio" name="conf-${fullKey}" value="${candidate.entryId}" ${checked ? "checked" : ""}/> <span>${formatConflictCandidateLabel(candidate)}</span>`;
            label.querySelector("input").addEventListener("change", () => {
              conflictChoices[kind][key] = candidate.entryId;
              updateImportButtonState();
            });
            wrap.appendChild(label);
          }
          block.appendChild(wrap);
        }
        conflictsBlock.appendChild(block);
      }

      function renderConflicts() {
        conflictsBlock.innerHTML = "";
        conflictsBlock.style.cssText = "margin-bottom:14px";
        renderConflictsForKind("chapter");
        renderConflictsForKind("volume");
        updateImportButtonState();
      }

      function buildSelectionForKind(kind) {
        const edition = getEditionForKind(kind);
        if (!edition) return null;
        if (edition.metadataOnly) {
          return {
            editionId: edition.id,
            isFrenchEdition: true,
            contentKind: kind,
            metadataOnly: true,
            sections: [],
            selectedVolumeEntryIds: new Set(),
            conflictChoices: {},
          };
        }
        const sections = parseEditionSections(edition.block);
        const selectedVolumeEntryIds = getSelectedVolumeEntryIds(kind);
        readConflictChoicesFromPanel(kind);
        return {
          editionId: edition.id,
          isFrenchEdition: edition.isFrench,
          contentKind: kind,
          metadataOnly: false,
          sections,
          selectedVolumeEntryIds,
          conflictChoices: { ...conflictChoices[kind] },
          volumeDetailsCache: Object.fromEntries(volumeDetailsCache.entries()),
          volumeOverrides: readVolumeOverridesFromPanel(),
        };
      }

      profilesBlock.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.classList.contains("mg-profile-toggle")) {
          renderAll();
          return;
        }
        if (target.name === "mg-edition-chapter") {
          chapterEditionId = target.value;
          renderAll();
        }
        if (target.name === "mg-edition-volume") {
          volumeEditionId = target.value;
          renderAll();
        }
      });

      sectionsBlock.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.classList.contains("mg-section-pickable")) {
          const sectionId = target.getAttribute("data-section-id");
          panel
            .querySelectorAll(`.mg-volume-item[data-section-id="${sectionId}"]`)
            .forEach((input) => {
              input.checked = target.checked;
            });
        }
        if (target.classList.contains("mg-volume-item")) {
          syncPickableSectionMaster(target.getAttribute("data-section-id") || "");
        }
        updateSectionSelectionCounts();
        renderConflicts();
      });

      cancelBtn.onclick = () => {
        overlay.remove();
        reject(new Error("Import annulé."));
      };

      let importInProgress = false;

      async function collectValidatedSelections() {
        const selections = [];
        for (const kind of ["chapter", "volume"]) {
          if (!isProfileEnabled(kind)) continue;
          const selection = buildSelectionForKind(kind);
          if (!selection) continue;
          if (!selection.metadataOnly) {
            const preview = buildPickedVolumesFromSelection(
              selection.sections,
              selection.selectedVolumeEntryIds,
            );
            if (preview.length === 0) {
              toast(
                `Sélectionnez au moins un ${kind === "chapter" ? "chapitre" : "tome"}, ou décochez ce type.`,
                "error",
              );
              return null;
            }
            const conflicts = listVolumeNumberConflicts(preview);
            if (conflicts.some(([key]) => !selection.conflictChoices[key])) {
              toast("Résolvez les doublons de numéro.", "error");
              renderConflicts();
              return null;
            }
          }
          selections.push(selection);
        }
        if (selections.length === 0) {
          toast("Cochez au moins chapitres ou tomes.", "error");
          return null;
        }
        return selections;
      }

      async function buildPayloadsFromPanel() {
        const selections = await collectValidatedSelections();
        if (!selections) return null;

        const ownership = readOwnershipFromPanel();
        const metaOverrides = readMetadataOverrides(panel);
        const payloads = [];

        for (const selection of selections) {
          let payload = await buildPayload(selection);
          payload = mergeMetadataIntoPayload(payload, metaOverrides);
          if (ownership.mihonOwnerName) {
            payload.mihonOwnerName = ownership.mihonOwnerName;
          } else if (ownership.ownerNames.length > 0) {
            payload.ownerNames = ownership.ownerNames;
          }
          payloads.push(payload);
        }

        if (
          payloads.length === 2 &&
          payloads.some((p) => p.trackingUnit === "chapter") &&
          payloads.some((p) => p.trackingUnit === "volume")
        ) {
          const volumePayload = payloads.find((p) => p.trackingUnit === "volume");
          if (volumePayload && !volumePayload.title.includes("(Tomes)")) {
            volumePayload.title = `${volumePayload.title} (Tomes)`;
          }
        }

        return { payloads, ownership };
      }

      async function handleSendToApp(mode) {
        if (importInProgress) {
          return;
        }
        importInProgress = true;
        const previousReviewLabel = reviewBtn.textContent;
        const previousDirectLabel = directBtn.textContent;
        reviewBtn.disabled = true;
        directBtn.disabled = true;
        exportBtn.disabled = true;
        if (mode === "direct") {
          directBtn.textContent = "Envoi en cours…";
        } else {
          reviewBtn.textContent = "Envoi en cours…";
        }
        try {
          startImportChrono();
          const built = await buildPayloadsFromPanel();
          if (!built) {
            toast("Vérifiez la sélection et les doublons avant envoi.", "error");
            return;
          }

          await requestJson("/api/import-start", {});
          for (const payload of built.payloads) {
            const body =
              mode === "direct"
                ? { mode: "direct", payload }
                : payload;
            const path =
              mode === "direct" ? "/api/import-work-direct" : "/api/import-work";
            await requestJson(path, body);
            logImportRecap(payload, null, mode === "direct" ? "direct" : "import");
          }

          stopImportChrono("données reçues par Mangathèque");
          overlay.remove();
          resolve({
            payloads: built.payloads,
            mode,
            delivered: true,
          });
        } catch (e) {
          stopImportChrono("échec import");
          toast(`❌ ${e instanceof Error ? e.message : "Erreur"}`, "error");
          try {
            await requestJson("/api/import-cancel", {});
          } catch {
            /* ignoré */
          }
        } finally {
          importInProgress = false;
          reviewBtn.disabled = false;
          directBtn.disabled = false;
          exportBtn.disabled = false;
          reviewBtn.textContent = previousReviewLabel;
          directBtn.textContent = previousDirectLabel;
          updateImportButtonState();
        }
      }

      exportBtn.onclick = async () => {
        exportBtn.disabled = true;
        try {
          const selections = await collectValidatedSelections();
          if (!selections) return;
          const ownership = readOwnershipFromPanel();
          const metaOverrides = readMetadataOverrides(panel);
          startImportChrono();
          overlay.remove();
          resolve({
            selections,
            ...ownership,
            metaOverrides,
          });
        } finally {
          exportBtn.disabled = false;
        }
      };

      reviewBtn.onclick = () => {
        if (reviewBtn.disabled) {
          toast("Cochez au moins chapitres ou tomes à importer.", "error");
          return;
        }
        void handleSendToApp("review");
      };
      directBtn.onclick = () => {
        if (directBtn.disabled) {
          toast("Cochez au moins chapitres ou tomes à importer.", "error");
          return;
        }
        void handleSendToApp("direct");
      };

      const defaultPriceInput = panel.querySelector("#mg-meta-default-price");
      if (defaultPriceInput instanceof HTMLInputElement) {
        const syncVolumePricesFromDefault = () => propagateDefaultPriceToVolumes();
        defaultPriceInput.addEventListener("change", syncVolumePricesFromDefault);
        defaultPriceInput.addEventListener("blur", syncVolumePricesFromDefault);
      }

      const titleInput = panel.querySelector("#mg-meta-title");
      if (titleInput instanceof HTMLInputElement) {
        titleInput.addEventListener("input", syncModalTitleFromForm);
        titleInput.addEventListener("blur", syncModalTitleFromForm);
      }

      renderAll();
    });
  }
  function isWorkMainPage() {
    const path = window.location.pathname;
    if (!/^\/(mangas|light_novels)\//.test(path)) {
      return false;
    }
    return !/\/volume-\d+/i.test(path) && !/\/chapitre-\d+/i.test(path);
  }

  function resolveWorkMainPageUrl() {
    const path = window.location.pathname;
    const match = path.match(/^\/((?:mangas|light_novels)\/[^/]+)/);
    if (!match) {
      return "https://www.nautiljon.com";
    }
    return `https://www.nautiljon.com/${match[1]}.html`;
  }

  function nautiljonRequestHeaders() {
    return {
      Referer: resolveWorkMainPageUrl(),
      "User-Agent": navigator.userAgent,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": navigator.language || "fr-FR,fr;q=0.9",
    };
  }

  function fetchVolumePageViaIframe(url, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const iframe = document.createElement("iframe");
      iframe.style.cssText =
        "position:absolute;width:0;height:0;border:0;visibility:hidden";
      let settled = false;

      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        iframe.remove();
        fn(value);
      };

      const timer = setTimeout(() => {
        finish(reject, new Error("Timeout chargement tome"));
      }, timeoutMs);

      iframe.onload = () => {
        try {
          const doc = iframe.contentDocument;
          if (!doc) {
            throw new Error("Accès document bloqué");
          }
          finish(resolve, doc.documentElement.outerHTML);
        } catch (e) {
          finish(reject, e instanceof Error ? e : new Error("Erreur iframe"));
        }
      };

      iframe.onerror = () => finish(reject, new Error("Erreur iframe"));
      document.body.appendChild(iframe);
      iframe.src = url;
    });
  }

  function fetchVolumePage(url, retryCount = 0, maxRetries = 4) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        headers: nautiljonRequestHeaders(),
        onload: (res) => {
          const retryable = res.status === 429 || res.status === 403;
          if (retryable && retryCount < maxRetries) {
            const wait = Math.min(1500 * Math.pow(2, retryCount), 12000);
            setTimeout(() => {
              fetchVolumePage(url, retryCount + 1, maxRetries).then(resolve).catch(reject);
            }, wait);
            return;
          }
          if (res.status >= 200 && res.status < 300) {
            resolve(res.responseText);
            return;
          }
          if (res.status === 403) {
            fetchVolumePageViaIframe(url)
              .then(resolve)
              .catch(() => reject(new Error(`HTTP ${res.status}`)));
            return;
          }
          reject(new Error(`HTTP ${res.status}`));
        },
        onerror: () => reject(new Error("Réseau")),
      });
    });
  }

  function extractVolumeDetailsFromHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const releaseDate = extractReleaseDateVfFromDoc(doc);
    let coverUrl = null;
    const catalogPrice = extractPriceFromDoc(doc);

    let coverLink = doc.querySelector('a[id*="couverture"][href*="/images/"]');
    if (!coverLink) {
      coverLink = doc.querySelector(
        'a.cboxImage[href*="/images/"], a.cboxElement[href*="/images/"]',
      );
    }
    if (!coverLink) {
      const links = Array.from(doc.querySelectorAll('a[href*="/manga_volumes/"]'));
      coverLink = links.find((link) => {
        const href = link.getAttribute("href") || "";
        return (
          href.includes("/images/") &&
          !href.includes("/mini/") &&
          !href.includes("/imagesmin/")
        );
      });
    }
    if (coverLink) {
      coverUrl = toAbsoluteUrl(coverLink.getAttribute("href"));
    }

    if (!coverUrl) {
      const img = doc.querySelector('img[itemprop="image"], img[src*="/manga_volumes/"]');
      if (img) {
        let src = img.getAttribute("src") || "";
        src = src.replace("/mini/", "/").replace("/imagesmin/", "/images/");
        src = src.replace(/\?1(\d{10,})/, "?$1");
        if (src.includes("/images/")) {
          coverUrl = toAbsoluteUrl(src);
        }
      }
    }

    return { releaseDate, coverUrl, catalogPrice };
  }

  async function fetchOneVolumeDetails(vol, options = {}) {
    const { maxRetries = 4 } = options;
    const label = volumeDisplayLabel(vol);
    vol._fetchFailed = false;
    try {
      const html = await fetchVolumePage(vol.pageUrl, 0, maxRetries);
      const details = extractVolumeDetailsFromHtml(html);
      if (details.releaseDate) {
        vol.releaseDate = details.releaseDate;
      }
      if (details.coverUrl) {
        vol.coverUrl = details.coverUrl;
      }
      if (details.catalogPrice != null) {
        vol.catalogPrice = details.catalogPrice;
      }
      if (!vol.releaseDate) {
        vol._fetchFailed = true;
      }
      console.log(
        `  ${vol.releaseDate ? "✅" : "⚠️"} ${label}: date=${vol.releaseDate || "—"}, prix=${vol.catalogPrice != null ? `${vol.catalogPrice} €` : "—"}, cover=${vol.coverUrl ? "✓" : "✗"}`,
      );
      return Boolean(vol.releaseDate);
    } catch (e) {
      vol._fetchFailed = true;
      console.warn(
        `  ❌ ${label}: ${e instanceof Error ? e.message : e} (données partielles conservées)`,
      );
      return false;
    }
  }

  async function fetchVolumeDetails(volumes) {
    const needsFetch = volumes.filter(
      (v) => !v.releaseDate || !v.coverUrl || v.catalogPrice == null,
    );
    if (needsFetch.length === 0) {
      console.log("✅ Dates, couvertures et prix déjà présents sur la fiche principale.");
      return;
    }

    const total = needsFetch.length;
    const batchCount = Math.ceil(total / VOLUME_FETCH_CONCURRENCY);
    console.log(
      `🔄 Détails VF pour ${total} tome(s) — ${VOLUME_FETCH_CONCURRENCY} requêtes HTML en parallèle…`,
    );

    for (let batch = 0; batch < batchCount; batch++) {
      const start = batch * VOLUME_FETCH_CONCURRENCY;
      const chunk = needsFetch.slice(start, start + VOLUME_FETCH_CONCURRENCY);
      const end = start + chunk.length;
      console.log(`  Lot ${batch + 1}/${batchCount} (tomes ${start + 1}–${end}/${total})`);
      await Promise.all(chunk.map((vol) => fetchOneVolumeDetails(vol)));
      const batchHadError = chunk.some((vol) => vol._fetchFailed);
      if (batch < batchCount - 1) {
        const delay = batchHadError
          ? VOLUME_FETCH_COOLDOWN_AFTER_ERROR_MS
          : VOLUME_FETCH_BATCH_DELAY_MS;
        if (batchHadError) {
          console.log(`  ⏸ Pause ${delay} ms (rate-limit détecté)…`);
        }
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    for (let pass = 1; pass <= VOLUME_FETCH_RETRY_MAX_PASSES; pass++) {
      const retryList = needsFetch.filter((vol) => !vol.releaseDate);
      if (retryList.length === 0) break;

      console.log(
        `🔁 Passe de rattrapage ${pass}/${VOLUME_FETCH_RETRY_MAX_PASSES} — ${retryList.length} tome(s) sans date VF…`,
      );
      for (let i = 0; i < retryList.length; i++) {
        const vol = retryList[i];
        console.log(`  ↻ ${volumeDisplayLabel(vol)} (${i + 1}/${retryList.length})`);
        await fetchOneVolumeDetails(vol, { maxRetries: 6 });
        if (i < retryList.length - 1) {
          await new Promise((r) => setTimeout(r, VOLUME_FETCH_RETRY_DELAY_MS));
        }
      }
    }

    const stillMissing = needsFetch.filter((vol) => !vol.releaseDate);
    if (stillMissing.length > 0) {
      console.warn(
        `⚠️ ${stillMissing.length} tome(s) sans date VF après rattrapage : ${stillMissing.map((vol) => volumeDisplayLabel(vol)).join(", ")}`,
      );
    }
  }

  function mapPriceFormat(typeVolume) {
    const lower = String(typeVolume || "").toLowerCase();
    if (lower.includes("kindle") || lower.includes("numérique")) return "numerique";
    return "broche";
  }

  function normalizeAscii(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  /**
   * Extrait le statut VF depuis « Nb volumes VF : 10 (En cours) ».
   * @returns ongoing | completed | dropped | on_hold | null
   */
  function mapReadingStatusFromVfMeta(raw) {
    const text = normalizeSpace(raw);
    const match = text.match(/\(([^)]+)\)\s*$/);
    if (!match) return null;

    const label = normalizeAscii(match[1]);
    if (label.includes("termin")) return "completed";
    if (label.includes("abandon")) return "dropped";
    if (label.includes("attente")) return "on_hold";
    if (label.includes("cours")) return "ongoing";
    return null;
  }

  function parseVfVolumeCount(raw) {
    const match = normalizeSpace(raw).match(/^(\d+)/);
    return match ? Number(match[1]) : null;
  }

  async function buildPayload(selection) {
    const title = extractTitle();
    if (!title) throw new Error("Titre introuvable.");

    const meta = extractMetadataBlock();
    const defaultPrice = parsePriceEur(meta["Prix"] || "");
    const contentKind = selection.contentKind || "volume";
    const trackingUnit = contentKind === "chapter" ? "chapter" : "volume";
    const isFrenchEdition = selection.isFrenchEdition !== false;
    const isLn = window.location.pathname.includes("/light_novels/");

    let vfMetaRaw = "";
    let nbVf = null;
    let readingStatus = null;
    let nbVo = null;

    if (trackingUnit === "chapter") {
      vfMetaRaw = isFrenchEdition ? meta["Nb chapitres VF"] || "" : "";
      nbVf = isFrenchEdition ? parseVfVolumeCount(vfMetaRaw) : null;
      readingStatus = isFrenchEdition
        ? mapReadingStatusFromVfMeta(vfMetaRaw)
        : null;
      const voRaw = meta["Nb chapitres VO"] || meta["Nb chapitres"] || "";
      nbVo = voRaw.match(/\d+/);
    } else {
      vfMetaRaw = meta["Nb volumes VF"] || "";
      nbVf = isFrenchEdition ? parseVfVolumeCount(vfMetaRaw) : null;
      readingStatus = isFrenchEdition
        ? mapReadingStatusFromVfMeta(vfMetaRaw)
        : null;
      nbVo = (meta["Nb volumes VO"] || meta["Nb volumes"] || "").match(/\d+/);
    }

    let volumes = [];
    if (!selection.metadataOnly) {
      volumes = collectSelectedVolumes(
        selection.sections,
        selection.conflictChoices,
        selection.selectedVolumeEntryIds || new Set(),
      );

      if (selection.volumeDetailsCache) {
        for (const vol of volumes) {
          const cached = selection.volumeDetailsCache[vol.entryId];
          if (!cached) continue;
          if (cached.releaseDate) vol.releaseDate = cached.releaseDate;
          if (cached.catalogPrice != null) vol.catalogPrice = cached.catalogPrice;
          if (cached.coverUrl) vol.coverUrl = cached.coverUrl;
        }
      }

      if (volumes.length > 0) await fetchVolumeDetails(volumes);

      if (selection.volumeOverrides) {
        for (const vol of volumes) {
          const override = selection.volumeOverrides[vol.entryId];
          if (override?.catalogPrice != null) {
            vol.catalogPrice = override.catalogPrice;
          }
        }
      }

      const vfMax = nbVf && nbVf > 0 ? nbVf : null;
      if (vfMax && isFrenchEdition) {
        volumes = volumes.filter(
          (v) =>
            v.volumeLabel ||
            (v.volumeNumber != null && v.volumeNumber <= vfMax),
        );
      }
    }

    let priceFormat = mapPriceFormat(
      isLn ? "Light Novel" : meta["Type volume"] || "Broché",
    );
    if (trackingUnit === "chapter" && !String(meta["Type volume"] || "").toLowerCase().includes("broch")) {
      priceFormat = "numerique";
    }

    return {
      schemaVersion: 1,
      title,
      demographicType: meta["Type"] || null,
      genres: extractTaggedListFromDoc(document, ["Genres", "Genre"]),
      themes: extractTaggedListFromDoc(document, ["Thèmes", "Thème"]),
      publisherVf:
        resolvePublisherVf(meta) ||
        (isFrenchEdition ? null : getMetaValue(meta, "Éditeur VO") || null),
      volumesVfCount:
        nbVf ??
        (volumes.filter((v) => v.volumeNumber != null && !v.volumeLabel).length ||
          null),
      volumesVoTotal: nbVo ? Number(nbVo[0]) : null,
      readingStatus,
      trackingUnit,
      defaultPrice: trackingUnit === "chapter" && defaultPrice == null ? undefined : defaultPrice,
      priceFormat,
      synopsis: extractSynopsis(),
      coverUrl: extractCoverUrl() || null,
      sourceUrl: window.location.href,
      volumes: volumes.map((v) => ({
        volumeNumber: v.volumeNumber ?? null,
        volumeLabel: v.volumeLabel || undefined,
        coverUrl: v.coverUrl,
        releaseDate: v.releaseDate,
        editionType: v.editionType,
        catalogPrice: v.catalogPrice ?? undefined,
      })),
    };
  }

  async function runImportWithSelection(options = { purpose: "export" }) {
    const catalog = buildImportCatalog();
    const modalResult = await showImportSelectionModal(catalog, options);
    if (modalResult.delivered && modalResult.payloads) {
      return modalResult.payloads.length === 1
        ? modalResult.payloads[0]
        : modalResult.payloads;
    }

    const selections = modalResult.selections || modalResult;
    const ownerNames = modalResult.ownerNames || [];
    const mihonOwnerName = modalResult.mihonOwnerName || null;
    const metaOverrides = modalResult.metaOverrides || null;
    const payloads = [];
    for (const selection of selections) {
      let payload = await buildPayload(selection);
      if (metaOverrides) {
        payload = mergeMetadataIntoPayload(payload, metaOverrides);
      }
      if (mihonOwnerName) {
        payload.mihonOwnerName = mihonOwnerName;
      } else if (ownerNames.length > 0) {
        payload.ownerNames = ownerNames;
      }
      payloads.push(payload);
    }
    if (
      payloads.length === 2 &&
      payloads.some((p) => p.trackingUnit === "chapter") &&
      payloads.some((p) => p.trackingUnit === "volume")
    ) {
      const volumePayload = payloads.find((p) => p.trackingUnit === "volume");
      if (volumePayload && !volumePayload.title.includes("(Tomes)")) {
        volumePayload.title = `${volumePayload.title} (Tomes)`;
      }
    }
    return payloads.length === 1 ? payloads[0] : payloads;
  }

  function requestJson(path, body) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: `${BASE}${path}`,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify(body || {}),
        onload: (res) => {
          try {
            const data = JSON.parse(res.responseText || "{}");
            if (res.status >= 200 && res.status < 300) resolve(data);
            else reject(new Error(data.error || `HTTP ${res.status}`));
          } catch (e) {
            reject(e);
          }
        },
        onerror: () =>
          reject(
            new Error(
              "Mangathèque injoignable. Lancez l'app bureau (npm run dev:desktop).",
            ),
          ),
      });
    });
  }

  function toast(message, kind, durationMs = 4500) {
    const el = document.createElement("div");
    el.innerHTML = message;
    const bg =
      kind === "success" ? "#059669" : kind === "error" ? "#dc2626" : "#4f46e5";
    el.style.cssText = `position:fixed;top:16px;right:16px;z-index:999999;color:#fff;padding:12px 16px;border-radius:10px;background:${bg};max-width:420px;font:14px/1.45 Segoe UI,sans-serif;line-height:1.45;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), durationMs);
  }

  function isMobileBrowser() {
    return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  }

  function safeFileName(title) {
    return String(title || "serie")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w.-]+/g, "_")
      .slice(0, 60);
  }

  async function copyTextToClipboard(text) {
    if (typeof GM_setClipboard === "function") {
      GM_setClipboard(text, { type: "text", mimetype: "text/plain" });
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    throw new Error("Presse-papiers indisponible sur ce navigateur.");
  }

  function downloadJsonExport(title, json) {
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mangatheque-${safeFileName(title)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function extractPayloadWithOverlay() {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:999998;background:rgba(0,0,0,.8);display:grid;place-items:center;color:#fff;font:16px Segoe UI,sans-serif;";
    overlay.textContent = "Préparation de l'import…";
    document.body.appendChild(overlay);
    try {
      return await runImportWithSelection();
    } finally {
      overlay.remove();
    }
  }

  async function handleExportJson() {
    try {
      const result = await extractPayloadWithOverlay();
      const payloads = Array.isArray(result) ? result : [result];
      const json = JSON.stringify(payloads.length === 1 ? payloads[0] : payloads, null, 2);
      const mobile = isMobileBrowser();
      const title = payloads[0]?.title ?? "serie";

      try {
        await copyTextToClipboard(json);
      } catch (clipboardError) {
        if (mobile) {
          toast(
            `❌ ${clipboardError instanceof Error ? clipboardError.message : "Presse-papiers indisponible"}`,
            "error",
          );
          return;
        }
        downloadJsonExport(title, json);
        toast(
          `📥 Fichier JSON téléchargé pour <strong>${title}</strong>. Importez-le dans Mangathèque.`,
          "success",
        );
        return;
      }

      if (!mobile) {
        downloadJsonExport(title, json);
      }

      const elapsed = stopImportChrono("extraction terminée");
      for (const payload of payloads) {
        logImportRecap(payload, elapsed, "export");
      }

      const recapLabel =
        payloads.length > 1
          ? `<strong>${payloads.length} imports</strong> (${payloads.map((p) => p.trackingUnit === "chapter" ? "chapitres" : "tomes").join(" + ")})`
          : buildExportRecapToast(payloads[0], elapsed, summarizePayloadVolumes(payloads[0].volumes));

      toast(
        mobile
          ? `${recapLabel}<br><span style="opacity:.88;font-size:12px">Mangathèque → Ajouter → Importer JSON → Coller.</span>`
          : `${recapLabel}<br><span style="opacity:.88;font-size:12px">Fichier JSON téléchargé en secours.</span>`,
        "success",
        7000,
      );
    } catch (e) {
      stopImportChrono("échec export");
      toast(`❌ ${e instanceof Error ? e.message : "Erreur"}`, "error");
    }
  }

  async function handleImport() {
    try {
      const result = await showImportSelectionModal(buildImportCatalog(), {
        purpose: "app",
      });
      if (!result.delivered) {
        return;
      }
      const payloads = Array.isArray(result.payloads)
        ? result.payloads
        : [result.payloads];
      const modeLabel =
        result.mode === "direct"
          ? "Import direct terminé"
          : "Données envoyées — contrôlez dans l'app";
      toast(
        payloads.length > 1
          ? `📥 <strong>${payloads.length} imports</strong> (${modeLabel}).`
          : buildImportRecapToast(
              payloads[0],
              stopImportChrono("import") || "?",
              summarizePayloadVolumes(payloads[0].volumes),
              result.mode !== "direct",
            ),
        "success",
        8000,
      );
    } catch (e) {
      stopImportChrono("échec import");
      toast(`❌ ${e instanceof Error ? e.message : "Erreur"}`, "error");
      try {
        await requestJson("/api/import-cancel", {});
      } catch {
        /* ignoré */
      }
    }
  }

  function mountUnsupportedOverlay() {
    if (document.getElementById("mangatheque-url-overlay")) return;
    const mainUrl = resolveWorkMainPageUrl();
    const overlay = document.createElement("div");
    overlay.id = "mangatheque-url-overlay";
    overlay.style.cssText =
      "position:fixed;top:0;left:0;right:0;z-index:999999;padding:14px 18px;font:14px/1.5 Segoe UI,sans-serif;color:#fff;background:linear-gradient(135deg,#7c2d12,#b45309);box-shadow:0 8px 24px rgba(0,0,0,.35);";
    overlay.innerHTML = `
      <strong>⚠️ Page tome non supportée par Mangathèque</strong><br>
      <span style="opacity:.95">
        URL acceptée : fiche principale de la série (ex. <code style="background:rgba(0,0,0,.2);padding:2px 6px;border-radius:4px">…/mangas/nom.html</code>)<br>
        URL actuelle : page d'un tome (<code style="background:rgba(0,0,0,.2);padding:2px 6px;border-radius:4px">…/volume-18,….html</code>)
      </span><br>
      <a href="${mainUrl}" style="display:inline-block;margin-top:10px;padding:8px 14px;border-radius:8px;background:#fff;color:#7c2d12;font-weight:700;text-decoration:none">
        ← Revenir à la page principale de la série
      </a>
    `;
    document.body.appendChild(overlay);
  }

  function mountActionButton(id, label, bottom, gradient, onClick) {
    if (document.getElementById(id)) return;
    const btn = document.createElement("button");
    btn.id = id;
    btn.type = "button";
    btn.textContent = label;
    btn.style.cssText = `position:fixed;left:16px;bottom:${bottom}px;z-index:999997;border:0;padding:12px 16px;border-radius:10px;color:#fff;font-weight:600;cursor:pointer;background:${gradient};box-shadow:0 8px 24px rgba(0,0,0,.35);max-width:calc(100vw - 32px);`;
    btn.onclick = onClick;
    document.body.appendChild(btn);
  }

  function mountButtons() {
    const mobile = isMobileBrowser();

    if (mobile) {
      mountActionButton(
        "mangatheque-export-btn",
        "📋 Exporter JSON Mangathèque",
        16,
        "linear-gradient(135deg,#059669,#047857)",
        () => void handleExportJson(),
      );
      return;
    }

    mountActionButton(
      "mangatheque-import-btn",
      "📚 Importer dans Mangathèque",
      16,
      "linear-gradient(135deg,#6366f1,#4f46e5)",
      () => void handleImport(),
    );
    mountActionButton(
      "mangatheque-export-btn",
      "📋 Exporter JSON",
      72,
      "linear-gradient(135deg,#059669,#047857)",
      () => void handleExportJson(),
    );
  }

  function init() {
    if (!isWorkMainPage()) {
      mountUnsupportedOverlay();
      return;
    }
    mountButtons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
