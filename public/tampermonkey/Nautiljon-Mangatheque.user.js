// ==UserScript==
// @name         Nautiljon → Mangathèque
// @namespace    https://github.com/Rory-Mercury-91/Mangatheque
// @version      1.15.9
// @description  Envoie les fiches Nautiljon vers Mangathèque — export JSON par téléchargement direct
// @author       Mangathèque
// @match        https://www.nautiljon.com/mangas/*
// @match        https://www.nautiljon.com/light_novels/*
// @match        https://www.nautiljon.com/artbook/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_download
// @downloadMode browser
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
  const OWNER_SHORT = { Céline: "C", Sébastien: "S", Alexandre: "A" };
  const OWNER_COLORS = {
    Céline: "#eab308",
    Sébastien: "#22c55e",
    Alexandre: "#3b82f6",
  };
  const MIHON_COLOR = "#22d3ee";

  /** @description Layout cartes tomes (mobile étroit ou appareil mobile). */
  function usesCompactVolumeLayout() {
    return (
      isMobileBrowser() ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(max-width: 640px)").matches)
    );
  }

  /**
   * Libellés de métadonnées Nautiljon centralisés (évite les fautes de frappe silencieuses
   * lors des accès à l'objet `meta` retourné par extractMetadataFromDoc / extractMetadataBlock).
   */
  const META_KEYS = {
    PRICE: "Prix",
    TYPE: "Type",
    TYPE_VOLUME: "Type volume",
    WEBCOMIC: "Webcomic",
    PUBLISHER_VF_PLURAL: "Éditeurs VF",
    PUBLISHER_VF: "Éditeur VF",
    PUBLISHER: "Éditeur",
    PUBLISHER_VO: "Éditeur VO",
    PUBLISHER_VO_PLURAL: "Éditeurs VO",
    PREPUBLISHED_IN: "Prépublié dans",
    NB_VOLUMES_VF: "Nb volumes VF",
    NB_VOLUMES_VO: "Nb volumes VO",
    NB_VOLUMES: "Nb volumes",
    NB_CHAPTERS_VF: "Nb chapitres VF",
    NB_CHAPTERS_VO: "Nb chapitres VO",
    NB_CHAPTERS: "Nb chapitres",
    GENRES: ["Genres", "Genre"],
    THEMES: ["Thèmes", "Thème"],
    RELEASE_DATE_VF_LONG: "Date de parution VF",
    RELEASE_DATE_VF_SHORT: "Parution VF",
  };

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
    }
    if (payload.ownerNames?.length) {
      console.log(`   Achat : ${payload.ownerNames.join(", ")}`);
    }

    const tableRows = (payload.volumes || []).map((v) => ({
      Tome: v.volumeNumber ?? "—",
      Libellé: v.volumeLabel || "",
      Édition: v.editionType === "collector" ? "Collector" : "Simple",
      "Date VF": v.releaseDate || "—",
      Prix: v.catalogPrice != null ? `${v.catalogPrice} €` : "—",
      Partagé:
        v.ownerNames?.length >= 2
          ? v.sharedPurchase === false
            ? "Non"
            : "Oui"
          : "—",
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
    for (const key of [META_KEYS.RELEASE_DATE_VF_LONG, META_KEYS.RELEASE_DATE_VF_SHORT]) {
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

  /** @description Indique si l'utilisateur a modifié manuellement un champ prix tome. */
  function isPriceInputUserEdited(input) {
    return Boolean(input?.dataset?.userEdited);
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
    return extractMetadataFromDoc(document, { excludeEditionBlocks: true });
  }

  /** @description Indique si un nœud se trouve dans un bloc édition Nautiljon (edition_N). */
  function isInsideEditionBlock(node) {
    return Boolean(node?.closest?.('div[id^="edition_"]'));
  }

  const META_LABEL_SELECTOR = "span.bold, .bold, b, strong";

  /**
   * @description Liste les entrées métadonnées Nautiljon (tous les blocs ul.mb10, etc.).
   */
  function listMetaItemsFromRoot(root) {
    const seen = new Set();
    const items = [];

    function pushItem(item) {
      if (!item || seen.has(item)) return;
      seen.add(item);
      items.push(item);
    }

    for (const list of root.querySelectorAll("ul.mb10")) {
      for (const item of list.querySelectorAll(":scope > li")) {
        pushItem(item);
      }
    }

    for (const list of root.querySelectorAll(
      ".infos_generales ul, #infos_generales ul, .fiche_manga ul, #fiche_manga ul, .top_bloc ul",
    )) {
      for (const item of list.querySelectorAll(":scope > li")) {
        pushItem(item);
      }
    }

    return items;
  }

  /** @description Lit le libellé d'une ligne métadonnée Nautiljon. */
  function readMetaItemLabel(item) {
    const labelNode = item.querySelector(META_LABEL_SELECTOR);
    if (labelNode) {
      return normalizeSpace(labelNode.textContent).replace(/\s*:\s*$/, "");
    }
    const text = normalizeSpace(item.textContent || "");
    const match = text.match(/^([^:]{2,40})\s*:/);
    return match ? normalizeSpace(match[1]) : "";
  }

  /** @description Lit la valeur d'une ligne métadonnée (liens ou texte brut). */
  function readMetaItemValue(item) {
    const fromLinks = Array.from(item.querySelectorAll("a[href]"))
      .map((anchor) => normalizeSpace(anchor.textContent))
      .filter(Boolean);
    if (fromLinks.length > 0) {
      return { type: "tags", value: fromLinks };
    }

    const clone = item.cloneNode(true);
    clone.querySelectorAll(META_LABEL_SELECTOR).forEach((node) => node.remove());
    return { type: "text", value: normalizeSpace(clone.textContent) };
  }

  /** @description Compare un libellé Nautiljon à une liste de variantes attendues. */
  function labelMatchesVariants(label, labelVariants) {
    const normalized = normalizeAscii(label);
    return labelVariants.some(
      (variant) => normalized === normalizeAscii(variant),
    );
  }

  function extractMetadataFromDoc(root, options = {}) {
    const { excludeEditionBlocks = false } = options;
    const meta = {};
    for (const item of listMetaItemsFromRoot(root)) {
      if (excludeEditionBlocks && isInsideEditionBlock(item)) {
        continue;
      }
      const label = readMetaItemLabel(item);
      if (!label) continue;
      const parsed = readMetaItemValue(item);
      const value =
        parsed.type === "tags" ? parsed.value.join(" - ") : parsed.value;
      if (value) meta[label] = value;
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
    const seenItems = new Set();

    function tryItem(item) {
      if (!item || seenItems.has(item)) return null;
      seenItems.add(item);
      const label = readMetaItemLabel(item);
      if (!labelMatchesVariants(label, labelVariants)) return null;

      const parsed = readMetaItemValue(item);
      if (parsed.type === "tags") return parsed.value;
      if (parsed.value) return splitTags(parsed.value);
      return null;
    }

    for (const item of listMetaItemsFromRoot(root)) {
      const tags = tryItem(item);
      if (tags?.length) return tags;
    }

    for (const item of root.querySelectorAll("li")) {
      const tags = tryItem(item);
      if (tags?.length) return tags;
    }

    for (const node of root.querySelectorAll("p, div, dd")) {
      const text = normalizeSpace(node.textContent || "");
      if (!text || text.length > 500) continue;
      if (node.querySelector("h3, .unVol, .unChap, table")) continue;

      for (const variant of labelVariants) {
        const re = new RegExp(
          `^${variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*(.+)$`,
          "i",
        );
        const match = text.match(re);
        if (!match) continue;

        const fromLinks = Array.from(node.querySelectorAll("a[href]"))
          .map((anchor) => normalizeSpace(anchor.textContent))
          .filter(Boolean);
        if (fromLinks.length > 0) return fromLinks;
        return splitTags(match[1]);
      }
    }

    const meta = extractMetadataFromDoc(root);
    for (const variant of labelVariants) {
      const value = getMetaValue(meta, variant);
      if (value) return splitTags(value);
    }

    return [];
  }

  /**
   * @description Éditeur(s) VF — Nautiljon passe au pluriel quand plusieurs éditeurs.
   */
  function resolvePublisherVf(meta) {
    return getMetaValue(
      meta,
      META_KEYS.PUBLISHER_VF_PLURAL,
      META_KEYS.PUBLISHER_VF,
      META_KEYS.PUBLISHER,
    );
  }

  /**
   * @description Éditeur(s) VO — couvre la forme plurielle utilisée sur les webtoons.
   */
  function resolvePublisherVo(meta) {
    return getMetaValue(
      meta,
      META_KEYS.PUBLISHER_VO,
      META_KEYS.PUBLISHER_VO_PLURAL,
    );
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
    /*
     * Retire les segments avec licence expirée ou numérique pur (webcomics).
     * Sur les webtoons, tous les VF listés en fiche principale peuvent être
     * expirés — dans ce cas on retourne vide, l'éditeur physique viendra du
     * bloc édition via parseEditionBlockMetadata.
     */
    const active = parts.filter(
      (part) =>
        !/licence\s*expir/i.test(part) &&
        !/smartoon/i.test(part),
    );
    if (active.length > 0) return active.join(", ");
    /* Tous expirés → retourner vide pour laisser le bloc édition gagner. */
    return "";
  }

  function extractPriceFromDoc(doc) {
    const meta = extractMetadataFromDoc(doc);
    const fromMeta = parsePriceEur(meta[META_KEYS.PRICE] || "");
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
      .split(/\s*[-|,•]\s*/g)
      .map((t) => normalizeSpace(t))
      .filter(Boolean);
  }

  /** @description Retourne null si la liste de tags est vide (évite de bloquer les replis). */
  function readTagListFromInput(raw) {
    const tags = splitTags(raw);
    return tags.length > 0 ? tags : null;
  }

  /** @description Conserve les tags saisis ; sinon relit la page Nautiljon. */
  function resolvePreservedTagList(preservedValue, fallback) {
    if (Array.isArray(preservedValue) && preservedValue.length > 0) {
      return preservedValue;
    }
    return fallback();
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
    const publisherVo = resolvePublisherVo(meta);
    if (publisherVo) {
      return `${publisherVo} (VO)`;
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
            ? `${pickPrimaryPublisherVf(resolvePublisherVf(meta)) || meta[META_KEYS.PREPUBLISHED_IN] || "Chapitres"} (VF)`
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

    const hasChapter = editions.some((e) => e.contentKind === "chapter");
    const hasVolume = editions.some((e) => e.contentKind === "volume");

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
   * @description Bloc édition de référence pour éditeur / compteurs / prix.
   * Utilise l'édition sélectionnée (chapter ou volume) si disponible,
   * sinon le premier bloc VF non-metadata.
   */
  function resolveMetadataEdition(profile, kind, selectedEditionId = null) {
    const editions = profile?.editions || [];
    if (selectedEditionId) {
      const selected = editions.find((edition) => edition.id === selectedEditionId);
      if (selected) return selected;
    }
    return editions.find((edition) => !edition.metadataOnly) || editions[0] || null;
  }

  /**
   * @description Construit un catalogue synthétique pour les artbooks Nautiljon.
   * Un artbook est un item unique (pas de blocs édition, pas de section Volumes).
   * On fabrique un bloc DOM minimal que parseEditionSections/parseVolumeNode
   * peuvent lire de manière transparente.
   * @param meta - Métadonnées extraites de la fiche principale.
   */
  function buildArtbookCatalog(meta) {
    const publisherVf = pickPrimaryPublisherVf(resolvePublisherVf(meta));
    const releaseDateVfRaw =
      getMetaValue(meta, META_KEYS.RELEASE_DATE_VF_LONG) ||
      getMetaValue(meta, META_KEYS.RELEASE_DATE_VF_SHORT) ||
      "";
    const price = parsePriceEur(meta[META_KEYS.PRICE] || "");
    const isFrench = Boolean(publisherVf || releaseDateVfRaw);

    /* Bloc DOM synthétique simulant une section "Volume simple" avec 1 artbook. */
    const block = document.createElement("div");
    const h3 = document.createElement("h3");
    h3.textContent = "Volume simple";
    const sectionDiv = document.createElement("div");
    sectionDiv.id = "artbook-edition-0-1";
    const unVol = document.createElement("div");
    unVol.className = "unVol";
    const link = document.createElement("a");
    link.href = window.location.href;
    link.title = "Vol. 1";
    link.className = "tooltip";
    const coverImg = document.createElement("img");
    coverImg.src = extractCoverUrl() || "";
    coverImg.alt = "Vol. 1";
    link.appendChild(coverImg);
    const legend = document.createElement("div");
    legend.className = "infos_small legend";
    /* La date VF est intégrée dans le texte pour extractReleaseDateVfFromText. */
    legend.innerHTML = `<label><span class="checklike"></span><input type="checkbox" class="c nodisplay" value="artbook-1" name="e[]"> Vol. 1${releaseDateVfRaw ? ` <span class="infos_small">${escapeHtml(releaseDateVfRaw)}</span>` : ""}</label>`;
    unVol.append(link, legend);
    sectionDiv.appendChild(unVol);
    block.append(h3, sectionDiv);

    const syntheticEdition = {
      id: "artbook-edition",
      label: publisherVf || "Artbook",
      isFrench,
      contentKind: "volume",
      metadataOnly: false,
      block,
      lang: "fr",
    };

    /* Statut : si la date VF est passée ou présente → Terminé, sinon En cours. */
    const status = releaseDateVfRaw ? "completed" : "ongoing";

    return {
      meta,
      chapter: {
        contentKind: "chapter",
        available: false,
        editions: [],
        defaultEditionId: null,
        vfRaw: "",
        voRaw: "",
        vfCount: null,
        readingStatus: null,
        listedCount: 0,
        metadataOnly: true,
        priceFormat: "broche",
      },
      volume: {
        contentKind: "volume",
        available: true,
        vfRaw: `1 (${status === "completed" ? "Terminé" : "En cours"})`,
        voRaw: "",
        vfCount: 1,
        readingStatus: status,
        editions: [syntheticEdition],
        defaultEditionId: syntheticEdition.id,
        listedCount: 1,
        metadataOnly: false,
        priceFormat: "broche",
        /* Flag interne : pré-remplit le cache pour éviter un XHR redondant. */
        isArtbook: true,
        artbookCache: {
          releaseDate: releaseDateVfRaw ? toIsoDate(releaseDateVfRaw) : null,
          coverUrl: extractCoverUrl() || null,
          catalogPrice: price,
        },
      },
    };
  }

  /**
   * @description Sélectionne les éditions importables pour un type de contenu.
   * Préfère les VF ; sinon inclut VO / scan pour saisie manuelle dans la modale.
   */
  function selectEditionsForImportProfile(allEditions, meta, contentKind) {
    const blockEditions = allEditions.filter(
      (edition) => edition.contentKind === contentKind && !edition.metadataOnly,
    );
    const frenchEditions = blockEditions.filter((edition) => edition.isFrench);
    if (frenchEditions.length > 0) {
      return frenchEditions;
    }
    if (blockEditions.length > 0) {
      return blockEditions;
    }
    const metaEdition = createMetadataOnlyEdition(meta, contentKind);
    return metaEdition ? [metaEdition] : [];
  }

  /**
   * @description Catalogue chapitres / tomes détectés pour la modale d'import.
   */
  function buildImportCatalog() {
    const meta = extractMetadataBlock();

    /* Les pages artbook n'ont pas de blocs édition ni de section Volumes. */
    if (isArtbookPage()) {
      return buildArtbookCatalog(meta);
    }

    const allEditions = listAllEditions();

    function buildProfile(contentKind) {
      const editions = selectEditionsForImportProfile(allEditions, meta, contentKind);
      const defaultEdition =
        editions.find((edition) => edition.isFrench && !edition.metadataOnly) ||
        editions.find((edition) => !edition.metadataOnly) ||
        editions[0] ||
        null;
      const metadataEdition = resolveMetadataEdition(
        { editions },
        contentKind,
        defaultEdition?.id ?? null,
      );
      const blockMeta = metadataEdition?.block
        ? parseEditionBlockMetadata(metadataEdition.block)
        : {};

      /*
       * Clés de compteurs VF/VO dans la fiche principale selon le type de contenu.
       * Utilisées en fallback quand le bloc édition ne contient pas de <ul class="mb10">
       * (cas typique des manga dont la fiche globale porte les métadonnées).
       */
      const mainVfKeys =
        contentKind === "chapter"
          ? [META_KEYS.NB_CHAPTERS_VF, META_KEYS.NB_CHAPTERS]
          : [META_KEYS.NB_VOLUMES_VF, META_KEYS.NB_VOLUMES];
      const mainVoKeys =
        contentKind === "chapter"
          ? [META_KEYS.NB_CHAPTERS_VO, META_KEYS.NB_CHAPTERS]
          : [META_KEYS.NB_VOLUMES_VO, META_KEYS.NB_VOLUMES];
      const metaVfRaw = getMetaValue(meta, ...mainVfKeys);
      const metaVoRaw = getMetaValue(meta, ...mainVoKeys);

      const vfRaw = blockMeta.vfRaw || metaVfRaw || "";
      const voRaw = blockMeta.voRaw || metaVoRaw || "";
      const vfCount =
        blockMeta.vfCount ??
        (blockMeta.vfRaw ? parseVfVolumeCount(blockMeta.vfRaw) : null) ??
        (metaVfRaw ? parseVfVolumeCount(metaVfRaw) : null);
      const voCount =
        blockMeta.voCount ??
        (blockMeta.voRaw ? parseVfVolumeCount(blockMeta.voRaw) : null) ??
        (metaVoRaw ? parseVfVolumeCount(metaVoRaw) : null);
      const available =
        editions.length > 0 || vfCount != null || voCount != null;
      const manualEditionOnly =
        editions.length > 0 && editions.every((edition) => !edition.isFrench);

      return {
        contentKind,
        available,
        manualEditionOnly,
        vfRaw,
        voRaw,
        vfCount,
        voCount,
        readingStatus:
          blockMeta.readingStatus ||
          mapReadingStatusFromVfMeta(blockMeta.vfRaw || "") ||
          mapReadingStatusFromVfMeta(metaVfRaw),
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
          !String(
            blockMeta.meta?.[META_KEYS.TYPE_VOLUME] || meta[META_KEYS.TYPE_VOLUME] || "",
          )
            .toLowerCase()
            .includes("broch")
            ? "numerique"
            : mapPriceFormat(
                blockMeta.meta?.[META_KEYS.TYPE_VOLUME] ||
                  meta[META_KEYS.TYPE_VOLUME] ||
                  "Broché",
              ),
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
    let count =
      profile.vfCount ??
      (profile.vfRaw ? parseVfVolumeCount(profile.vfRaw) : null);
    let countSuffix = "";
    if (count == null) {
      count =
        profile.voCount ??
        (profile.voRaw ? parseVfVolumeCount(profile.voRaw) : null);
      if (count != null) countSuffix = " VO";
    }
    if (count != null) {
      const unit =
        profile.contentKind === "chapter"
          ? count > 1
            ? "chapitres"
            : "chapitre"
          : count > 1
            ? "tomes"
            : "tome";
      parts.push(`${count} ${unit}${countSuffix}`);
    }
    if (profile.manualEditionOnly) {
      parts.push("saisie manuelle");
    }
    parts.push(profile.priceFormat === "numerique" ? "Numérique" : "Broché");
    return parts.join(" · ");
  }

  function pickDefaultEditionId(volumeEditions) {
    const meta = extractMetadataBlock();
    const preferChapter =
      meta[META_KEYS.WEBCOMIC] === "Oui" && Boolean(meta[META_KEYS.NB_CHAPTERS_VF]);
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
    if (meta[META_KEYS.WEBCOMIC] === "Oui" && meta[META_KEYS.NB_CHAPTERS_VF] && !meta[META_KEYS.NB_VOLUMES_VF]) {
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
    const vfRaw = isChapter ? meta[META_KEYS.NB_CHAPTERS_VF] : meta[META_KEYS.NB_VOLUMES_VF];
    const voRaw = isChapter ? meta[META_KEYS.NB_CHAPTERS_VO] : meta[META_KEYS.NB_VOLUMES_VO];
    const vfCount = parseVfVolumeCount(vfRaw || "");
    const voCount = parseVfVolumeCount(voRaw || "");
    if (!vfCount && !voCount) return null;

    const isFrench = Boolean(vfCount);
    const publisher = isFrench
      ? pickPrimaryPublisherVf(resolvePublisherVf(meta))
      : resolvePublisherVo(meta);
    const baseLabel = publisher || (isChapter ? "Chapitres" : "Volumes");
    const suffix = isFrench ? "(VF)" : "(VO)";

    return {
      id: `meta-${contentKind}-${isFrench ? "vf" : "vo"}`,
      label: `${baseLabel} ${suffix}`,
      block: null,
      isFrench,
      lang: isFrench ? "fr" : "jp",
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
    /* Les artbooks utilisent /artbook/nom,id.html — pas de segment /volume-. */
    const artbookAnchor = node.querySelector("a[href*='/artbook/']");
    const anchor = volumeAnchor || chapterAnchor || artbookAnchor;
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
    const edition = volume.editionType || "classic";
    if (num != null) {
      return `num:${num}:${edition}`;
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

  /** Grille tomes — colonnes fixes ; la 1re s'adapte au libellé sans absorber l'espace restant. */
  const MG_VOL_GRID_COLS = "max-content 82px 78px 84px 84px";
  const MG_VOL_GRID_GAP = "12px";
  const MG_VOL_GRID_PAD_X = "10px";

  /** Styles inline — Nautiljon écrase les classes CSS du userscript. */
  const MG_VOL_TABLE_STYLES = {
    wrap: "margin-top:6px;border:1px solid #2d3340;border-radius:8px;background:#12141a;overflow:hidden",
    scroll: "display:block;max-height:min(240px,34vh);overflow-x:auto;overflow-y:auto;padding:0 4px",
    grid:
      "display:grid !important;grid-template-columns:" +
      MG_VOL_GRID_COLS +
      ";column-gap:" +
      MG_VOL_GRID_GAP +
      ";align-items:center;width:100%;min-width:560px;padding:0 " +
      MG_VOL_GRID_PAD_X +
      ";box-sizing:border-box;font-size:0.82rem",
    gridRow: "display:contents !important",
    headCell:
      "padding:8px 10px;font-weight:600;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.03em;border-bottom:1px solid #2d3340;background:#1e2230;color:#9aa0a6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis",
    bodyCell:
      "padding:7px 10px;vertical-align:middle;border-bottom:1px solid #252a36;overflow:hidden;min-width:0",
    tdName:
      "font-weight:500;color:#e8eaed;white-space:nowrap;text-overflow:ellipsis;text-align:left !important",
    tdDate: "text-align:center;color:#b4b8c0;font-size:0.78rem;font-variant-numeric:tabular-nums;white-space:nowrap",
    tdPrice: "text-align:right;white-space:nowrap",
    tdAchat: "text-align:center;padding:4px 0",
    tdMihon: "text-align:center;padding:4px 0",
    nameCell:
      "display:flex !important;align-items:center;justify-content:flex-start !important;gap:6px;min-width:0;overflow:hidden;text-align:left !important",
    priceCell:
      "display:inline-flex !important;align-items:center;justify-content:flex-end;gap:2px;max-width:100%",
    priceInput:
      "width:52px;flex:0 0 auto;box-sizing:border-box;padding:4px 5px;border-radius:6px;border:1px solid #3d4452;background:#0f1117;color:#e8eaed;font-size:0.78rem;text-align:right",
    priceSuffix: "color:#6b7280;font-size:0.72rem;flex:0 0 auto",
    collector: "opacity:0.72;font-weight:400",
  };

  const MG_OWNER_BTN_BASE_STYLE =
    "min-width:22px;padding:2px 4px;border-radius:999px;font-size:0.72rem;cursor:pointer;line-height:1.2";

  /**
   * @description Pastilles propriétaire alignées sur Mangathèque (cadre coloré / actif blanc).
   */
  function applyOwnerButtonColors(btn, active, kind, ownerName = "") {
    const color =
      kind === "mihon" ? MIHON_COLOR : OWNER_COLORS[ownerName] || "#6366f1";
    if (active) {
      btn.style.background = `color-mix(in srgb, ${color} 38%, #12141a)`;
      btn.style.borderColor = color;
      btn.style.color = "#fff";
    } else {
      btn.style.background = "#12141a";
      btn.style.borderColor = color;
      btn.style.color = color;
    }
  }

  function appendVolumeGridHead(grid, unitCol) {
    const row = document.createElement("div");
    row.className = "mg-vol-grid-row mg-vol-grid-row--head";
    row.style.cssText = MG_VOL_TABLE_STYLES.gridRow;
    for (const [label, align] of [
      [unitCol, "left"],
      ["Date VF", "center"],
      ["Prix", "right"],
      ["Achat", "center"],
      ["Mihon", "center"],
    ]) {
      const cell = document.createElement("div");
      cell.className = "mg-vol-grid-head-cell";
      cell.textContent = label;
      cell.style.cssText = `${MG_VOL_TABLE_STYLES.headCell};text-align:${align}`;
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }

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

  /** @description Miroir des règles @media étroit pour le panneau bas mobile / tablette. */
  function mirrorTouchLayoutMediaQueries(css) {
    return css.replace(
      /\/\* ── Mobile[\s\S]*?@media \(max-width: 640px\) \{([\s\S]*?)\n      \}/,
      (_full, inner) => {
        const touchRules = inner.replace(
          /#mangatheque-import-modal /g,
          "#mangatheque-import-modal.mg-touch-layout ",
        );
        return `/* ── Mobile / tablette tactile (panneau bas) ── */\n${touchRules}\n      @media (max-width: 640px) {${inner}\n      }`;
      },
    );
  }

  /** Styles des sections repliables de la modale d'import. */
  function injectImportModalStyles(overlay) {
    if (overlay.querySelector("#mg-import-modal-styles")) return;
    const style = document.createElement("style");
    style.id = "mg-import-modal-styles";
    style.textContent = mirrorTouchLayoutMediaQueries(`
      #mangatheque-import-modal .mg-collapsible-section {
        margin: 0 0 12px;
        padding: 10px 12px 10px 20px;
        border-radius: 10px;
        border: 1px solid #2d3340;
        background: #12141a;
      }
      #mangatheque-import-modal .mg-collapsible-section > summary {
        cursor: pointer;
        font-weight: 600;
        margin: 0 0 8px;
        padding: 0 0 0 2px;
        display: list-item;
        list-style-position: outside;
        list-style-type: disclosure-closed;
      }
      #mangatheque-import-modal .mg-collapsible-section[open] > summary {
        margin-bottom: 10px;
        list-style-type: disclosure-open;
      }
      #mangatheque-import-modal .mg-collapsible-section > summary::marker {
        color: #9aa0a6;
        font-size: 0.9em;
      }
      #mangatheque-import-modal .mg-collapsible-section > summary::-webkit-details-marker {
        color: #9aa0a6;
        margin-right: 6px;
      }
      #mangatheque-import-modal .mg-section-content {
        padding-left: 4px;
      }
      #mangatheque-import-modal .mg-meta-kind-block {
        margin: 12px 0 0;
        padding: 8px 10px 10px 16px;
        border-radius: 8px;
        border: 1px solid #2d3340;
        background: #0f1117;
      }
      #mangatheque-import-modal .mg-meta-kind-block > summary {
        cursor: pointer;
        font-weight: 600;
        margin: 0 0 8px;
        padding: 0 0 0 2px;
        display: list-item;
        list-style-position: outside;
        color: #e8eaed;
      }
      #mangatheque-import-modal .mg-meta-shared-title {
        margin: 0 0 8px;
        font-size: 0.82rem;
        font-weight: 600;
        color: #9aa0a6;
      }
      #mangatheque-import-modal .mg-type-toggle-row--dual {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      #mangatheque-import-modal .mg-type-toggle-row--single {
        display: flex;
        justify-content: center;
      }
      #mangatheque-import-modal .mg-type-toggle-col {
        display: flex;
        justify-content: center;
        align-items: flex-start;
      }
      #mangatheque-import-modal .mg-type-toggle-item {
        display: flex;
        gap: 8px;
        cursor: pointer;
        align-items: flex-start;
        max-width: 100%;
      }
      #mangatheque-import-modal .mg-edition-group {
        display: flex;
        flex-direction: column;
        align-items: center;
        max-width: 100%;
      }
      #mangatheque-import-modal .mg-edition-group-title {
        margin: 0 0 6px;
        font-size: 0.82rem;
        color: #9aa0a6;
        text-align: center;
      }
      #mangatheque-import-modal .mg-edition-group-value {
        margin: 0;
        font-size: 0.88rem;
        text-align: center;
      }
      #mangatheque-import-modal .mg-edition-choice {
        display: flex;
        gap: 8px;
        margin: 4px 0;
        cursor: pointer;
        font-size: 0.88rem;
        align-items: flex-start;
        text-align: left;
      }
      #mangatheque-import-modal .mg-owner-toggle-btn {
        padding: 5px 14px;
        border-radius: 9999px;
        border: 1px solid #3d4452;
        background: #0f1117;
        color: #9aa0a6;
        font-size: 0.88rem;
        cursor: pointer;
        line-height: 1.2;
      }
      #mangatheque-import-modal .mg-owner-toggle-btn:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }
      #mangatheque-import-modal .mg-shared-purchase-row {
        display: none;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin: 0 0 10px;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid #2d3340;
        background: #0f1117;
      }
      #mangatheque-import-modal .mg-shared-purchase-row.is-visible {
        display: flex;
      }
      #mangatheque-import-modal .mg-shared-toggle {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 0.82rem;
        color: #c9cdd3;
        cursor: pointer;
      }
      #mangatheque-import-modal .mg-shared-toggle input {
        width: 16px;
        height: 16px;
        accent-color: #6366f1;
      }
      #mangatheque-import-modal .mg-vol-shared-wrap {
        display: none;
        margin-top: 6px;
      }
      #mangatheque-import-modal .mg-vol-shared-wrap.is-visible {
        display: block;
      }
      #mangatheque-import-modal .mg-purchase-vol-btn:disabled,
      #mangatheque-import-modal .mg-mihon-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      #mangatheque-import-modal .mg-modal-footer-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
      }
      #mangatheque-import-modal .mg-modal-footer-right {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
      }
      #mangatheque-import-modal .mg-export-json-btn {
        padding: 8px 12px;
        border-radius: 9999px;
        border: 1px solid #6366f1;
        background: rgba(99, 102, 241, 0.12);
        color: #c7d2fe;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
      }
      #mangatheque-import-modal .mg-export-json-btn:disabled {
        border-color: #3d4452;
        background: transparent;
        color: #9aa0a6;
        font-weight: 400;
        cursor: not-allowed;
      }
      #mangatheque-import-modal .mg-export-json-btn:hover:not(:disabled) {
        color: #e8eaed;
        border-color: #6366f1;
      }
      #mangatheque-import-modal .mg-footer-status {
        margin: 0 0 8px;
        font-size: 0.82rem;
        line-height: 1.4;
        display: none;
      }
      #mangatheque-import-modal .mg-vol-grid {
        display: grid !important;
        grid-template-columns: ${MG_VOL_GRID_COLS};
        column-gap: ${MG_VOL_GRID_GAP};
        align-items: center;
        width: 100%;
        padding: 0 ${MG_VOL_GRID_PAD_X};
        box-sizing: border-box;
      }
      #mangatheque-import-modal .mg-vol-grid-head-cell,
      #mangatheque-import-modal .mg-vol-grid-body-cell {
        padding-left: 10px !important;
        padding-right: 10px !important;
      }
      #mangatheque-import-modal .mg-vol-grid-row {
        display: contents !important;
      }
      #mangatheque-import-modal .mg-vol-grid-head-cell {
        position: sticky;
        top: 0;
        z-index: 1;
      }
      #mangatheque-import-modal .mg-vol-grid .mg-vol-name-cell,
      #mangatheque-import-modal .mg-vol-grid .mg-vol-name-cell label {
        text-align: left !important;
        justify-content: flex-start !important;
      }

      /* ── Mobile ─────────────────────────────────────────────────────── */
      @media (max-width: 640px) {
        #mangatheque-import-modal .mg-collapsible-section {
          padding: 10px 10px 10px 16px;
        }
        #mangatheque-import-modal .mg-meta-title-demographic-row,
        #mangatheque-import-modal .mg-meta-grid-2col,
        #mangatheque-import-modal .mg-type-toggle-row--dual {
          grid-template-columns: 1fr !important;
        }
        #mangatheque-import-modal .mg-ownership-row {
          flex-direction: column !important;
          align-items: stretch !important;
          gap: 8px !important;
        }
        #mangatheque-import-modal .mg-ownership-row > span:first-child {
          min-width: 0 !important;
        }
        #mangatheque-import-modal .mg-modal-footer-actions {
          gap: 10px;
        }
        #mangatheque-import-modal .mg-modal-footer-right {
          flex: 1;
          justify-content: flex-end;
        }
        #mangatheque-import-modal button {
          min-height: 44px;
          font-size: 0.92rem;
        }
        #mangatheque-import-modal .mg-owner-toggle-btn,
        #mangatheque-import-modal .mg-purchase-vol-btn,
        #mangatheque-import-modal .mg-mihon-btn {
          min-height: 40px;
          padding: 7px 14px;
          font-size: 0.88rem;
        }
        #mangatheque-import-modal input[type="checkbox"] {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
        }
        /* Cartes tomes — mobile / étroit */
        #mangatheque-import-modal .mg-vol-card-list {
          display: flex;
          flex-direction: column;
          gap: 0;
          width: 100%;
        }
        #mangatheque-import-modal .mg-vol-card {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 12px;
          border-bottom: 1px solid #252a36;
        }
        #mangatheque-import-modal .mg-vol-card:last-child {
          border-bottom: none;
        }
        #mangatheque-import-modal .mg-vol-card-title {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-weight: 600;
          color: #e8eaed;
          font-size: 0.92rem;
          line-height: 1.35;
        }
        #mangatheque-import-modal .mg-vol-card-meta {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        #mangatheque-import-modal .mg-vol-card-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        #mangatheque-import-modal .mg-vol-card-field-label {
          font-size: 0.68rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: #9aa0a6;
        }
        #mangatheque-import-modal .mg-vol-card-ownership {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        #mangatheque-import-modal .mg-vol-card-ownership-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
        }
        #mangatheque-import-modal .mg-vol-card-ownership-label {
          flex: 0 0 52px;
          font-size: 0.72rem;
          font-weight: 600;
          color: #9aa0a6;
        }
        #mangatheque-import-modal .mg-vol-purchase-group,
        #mangatheque-import-modal .mg-vol-mihon-group {
          flex: 1;
          flex-wrap: wrap;
          justify-content: flex-start !important;
        }
        #mangatheque-import-modal .mg-vol-grid-scroll {
          max-height: min(420px, 52vh);
        }
        #mangatheque-import-modal .mg-purchase-vol-btn,
        #mangatheque-import-modal .mg-mihon-btn {
          min-width: 36px;
          min-height: 36px;
          padding: 6px 10px;
          font-size: 0.82rem;
        }
        #mangatheque-import-modal .mg-collapsible-section > summary,
        #mangatheque-import-modal .mg-meta-kind-block > summary {
          padding: 4px 0;
          font-size: 0.95rem;
        }
        #mangatheque-import-modal .mg-export-json-btn {
          min-height: 44px;
          font-size: 0.88rem;
          padding: 10px 14px;
        }
        /* Panneau réduit : barre minimale pour lire Nautiljon derrière */
        #mangatheque-import-modal .mg-mobile-panel.mg-panel-minimized {
          max-height: none !important;
          height: auto;
        }
        #mangatheque-import-modal .mg-mobile-panel.mg-panel-minimized .mg-modal-body,
        #mangatheque-import-modal .mg-mobile-panel.mg-panel-minimized .mg-modal-footer {
          display: none !important;
        }
        #mangatheque-import-modal .mg-mobile-minimize-btn {
          flex: 0 0 auto;
          min-height: 36px !important;
          min-width: 36px !important;
          padding: 4px 10px !important;
          font-size: 1rem !important;
          line-height: 1;
          border-radius: 8px;
          border: 1px solid #3d4452;
          background: #12141a;
          color: #9aa0a6;
          cursor: pointer;
        }
        #mangatheque-import-modal .mg-mobile-header-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding-top: 10px;
        }
        #mangatheque-import-modal .mg-mobile-header-row h2 {
          flex: 1;
          min-width: 0;
        }
      }
    `);
    overlay.appendChild(style);
  }

  /**
   * @description Crée un bloc repliable pour une section de la modale d'import.
   */
  function createCollapsibleSection(summaryText, { open = true, id = null } = {}) {
    const details = document.createElement("details");
    details.open = open;
    if (id) details.id = id;
    details.className = "mg-collapsible-section";
    const summary = document.createElement("summary");
    summary.textContent = summaryText;
    const content = document.createElement("div");
    content.className = "mg-section-content";
    details.append(summary, content);
    return { details, content, summary };
  }

  /** @description Extrait prix, éditeur, compteurs et statut depuis le bloc édition Nautiljon. */
  function parseEditionBlockMetadata(editionBlock) {
    if (!editionBlock) return {};

    const meta = {};
    for (const list of editionBlock.querySelectorAll("ul")) {
      for (const item of list.querySelectorAll(":scope > li")) {
        const labelNode = item.querySelector("span.bold, .bold, b, strong");
        if (!labelNode) continue;
        const label = normalizeSpace(labelNode.textContent).replace(/\s*:\s*$/, "");
        const clone = item.cloneNode(true);
        clone.querySelectorAll("span.bold, .bold, b, strong").forEach((node) => node.remove());
        const value = normalizeSpace(clone.textContent);
        if (label && value) meta[label] = value;
      }
    }

    for (const node of editionBlock.querySelectorAll("p, div")) {
      const text = normalizeSpace(node.textContent || "");
      if (!text || text.length > 220 || node.querySelector("h3, .unVol, .unChap")) {
        continue;
      }
      const match = text.match(/^([^:]{2,40})\s*:\s*(.+)$/);
      if (!match) continue;
      const label = normalizeSpace(match[1]);
      const value = normalizeSpace(match[2]);
      if (label && value && !meta[label]) meta[label] = value;
    }

    const vfRaw = getMetaValue(
      meta,
      META_KEYS.NB_VOLUMES_VF,
      META_KEYS.NB_CHAPTERS_VF,
      META_KEYS.NB_VOLUMES,
      META_KEYS.NB_CHAPTERS,
    );
    const voRaw = getMetaValue(
      meta,
      META_KEYS.NB_VOLUMES_VO,
      META_KEYS.NB_CHAPTERS_VO,
    );

    let readingStatus = mapReadingStatusFromVfMeta(vfRaw);
    if (!readingStatus) {
      const blob = normalizeAscii(editionBlock.textContent || "");
      if (/\btermine\b/.test(blob)) readingStatus = "completed";
      else if (/\babandon/.test(blob)) readingStatus = "dropped";
      else if (/\ben cours\b/.test(blob)) readingStatus = "ongoing";
      else if (/\ben attente\b/.test(blob)) readingStatus = "on_hold";
    }

    const vfCount = parseVfVolumeCount(vfRaw);
    const voMatch = String(voRaw || "").match(/\d+/);
    let voCount = voMatch ? Number(voMatch[0]) : null;
    if (readingStatus === "completed" && vfCount != null && vfCount > 0) {
      voCount = vfCount;
    }

    const price =
      parsePriceEur(meta[META_KEYS.PRICE] || "") ??
      (() => {
        const blob = normalizeSpace(editionBlock.textContent || "");
        const match = blob.match(/Prix\s*:\s*(\d+[,.]\d{2})/i);
        return match ? parsePriceEur(match[1]) : null;
      })();

    const publisherVf = getMetaValue(meta, META_KEYS.PUBLISHER_VF, META_KEYS.PUBLISHER_VF_PLURAL);

    return {
      meta,
      vfRaw,
      voRaw,
      vfCount,
      voCount,
      readingStatus,
      price,
      publisherVf,
    };
  }

  /** @description Extrait un prix indicatif depuis le bloc édition Nautiljon. */
  function inferEditionDefaultPrice(edition) {
    const fromBlock = parseEditionBlockMetadata(edition?.block);
    if (fromBlock.price != null) return fromBlock.price;
    if (!edition?.block) return null;
    const sections = parseEditionSections(edition.block);
    for (const section of sections) {
      if (!section.importable || section.kind === "collector") continue;
      for (const vol of section.volumes) {
        if (vol.catalogPrice != null) return vol.catalogPrice;
      }
    }
    const blob = normalizeSpace(edition.block.textContent || "");
    const match = blob.match(/prix[^0-9]*(\d+[,.]\d{2})/i);
    return match ? parsePriceEur(match[1]) : null;
  }

  /**
   * @description Libellé éditeur déduit du bloc édition, de la fiche principale ou du titre.
   * @param edition - Édition Nautiljon dont on cherche l'éditeur VF.
   * @param metaFallback - Objet meta fiche principale (fallback quand le bloc édition est vide).
   */
  function extractEditionPublisherLabel(edition, metaFallback = null) {
    const fromBlock = parseEditionBlockMetadata(edition?.block);
    if (edition?.isFrench !== false && fromBlock.publisherVf) {
      return fromBlock.publisherVf;
    }
    if (edition?.isFrench === false) {
      const voPublisher = resolvePublisherVo(fromBlock.meta || metaFallback || {});
      if (voPublisher) return voPublisher;
    }
    /* Fallback fiche principale : couvre les manga dont l'éditeur est dans le <ul> global. */
    if (metaFallback) {
      if (edition?.isFrench === false) {
        const fromVo = resolvePublisherVo(metaFallback);
        if (fromVo) return fromVo;
      } else {
        const fromMeta = pickPrimaryPublisherVf(resolvePublisherVf(metaFallback));
        if (fromMeta) return fromMeta;
      }
    }
    if (!edition?.label) return "";
    /* Dernier recours : nettoyer le libellé d'édition (ex. "Édition par défaut — VF"). */
    return edition.label
      .replace(/\s*\(.*\)\s*$/, "")
      .replace(/\s*—\s*VF\s*$/i, "")
      .trim();
  }

  /** @description Compteur VO depuis le profil ou le bloc édition. */
  function getProfileVoCount(profile, edition = null) {
    const editionMeta = edition?.block ? parseEditionBlockMetadata(edition.block) : null;
    if (editionMeta?.voCount != null) return editionMeta.voCount;
    const match = String(profile.voRaw || "").match(/\d+/);
    return match ? Number(match[0]) : null;
  }

  /** @description Compteur VF effectif pour une édition (bloc édition, meta ou volumes parus). */
  function getEditionVfCount(edition, profile) {
    if (edition?.isFrench === false) {
      return null;
    }
    const fromBlock = parseEditionBlockMetadata(edition?.block);
    if (fromBlock.vfCount != null && fromBlock.vfCount > 0) {
      return fromBlock.vfCount;
    }
    if (profile?.vfCount != null && profile.vfCount > 0) {
      return profile.vfCount;
    }
    if (!edition?.block) return null;
    const sections = parseEditionSections(edition.block);
    let released = 0;
    let maxNumber = 0;
    for (const section of sections) {
      if (!section.importable) continue;
      for (const vol of section.volumes) {
        if (vol.releaseDate) released += 1;
        if (vol.volumeNumber != null && vol.volumeNumber > maxNumber) {
          maxNumber = vol.volumeNumber;
        }
      }
    }
    return released || maxNumber || null;
  }

  /** @description Statut VF depuis le bloc édition ou le profil. */
  function getEditionReadingStatus(edition, profile) {
    const fromBlock = parseEditionBlockMetadata(edition?.block);
    if (fromBlock.readingStatus) return fromBlock.readingStatus;
    return mapReadingStatusFromVfMeta(profile?.vfRaw || "");
  }

  /** @description Libellé français d'un statut de lecture. */
  function formatReadingStatusLabel(status) {
    if (!status) return "";
    const labels = {
      ongoing: "En cours",
      completed: "Terminé",
      dropped: "Abandonné",
      on_hold: "En pause",
    };
    return labels[status] || "";
  }

  /** @description Affiche un compteur VF/VO avec statut entre parenthèses si disponible. */
  function formatCountStatusDisplay(raw, statusFallback = null) {
    const count =
      parseVfVolumeCount(raw) ??
      (String(raw || "").match(/\d+/)
        ? Number(String(raw).match(/\d+/)[0])
        : null);
    const status = mapReadingStatusFromVfMeta(raw) || statusFallback || null;
    const statusLabel = formatReadingStatusLabel(status);
    if (count != null && statusLabel) return `${count} (${statusLabel})`;
    if (count != null) return String(count);
    if (raw) return String(raw);
    return "—";
  }

  /** @description Ligne récap pour chapitres ou tomes (VF / VO). */
  function formatKindRecapLine(kind, profile, edition) {
    const label = kind === "chapter" ? "Chapitres" : "Tomes";
    const blockMeta = edition?.block ? parseEditionBlockMetadata(edition.block) : {};
    const vf = formatCountStatusDisplay(
      blockMeta.vfRaw || profile.vfRaw,
      blockMeta.readingStatus || getEditionReadingStatus(edition, profile),
    );
    const vo = formatCountStatusDisplay(blockMeta.voRaw || profile.voRaw);
    return `${label} — VF : ${vf} / VO : ${vo}`;
  }

  const MG_META_INPUT_STYLE =
    "padding:6px 8px;border-radius:6px;border:1px solid #3d4452;background:#0f1117;color:#e8eaed";

  function createMetadataSectionShell() {
    const block = document.createElement("details");
    block.id = "mg-metadata-block";
    block.open = true;
    block.className = "mg-collapsible-section";
    block.innerHTML = `
      <summary>3. Fiche série</summary>
      <div id="mg-metadata-content" class="mg-section-content"></div>`;
    return block;
  }

  function readKindMetadataUserEdited(panel, kind) {
    const flag = (suffix) =>
      panel.querySelector(`#mg-meta-${kind}-${suffix}`)?.dataset.userEdited === "true";
    return {
      defaultPrice: flag("default-price"),
      vfCount: flag("vf-count"),
      voCount: flag("vo-count"),
      publisher: flag("publisher"),
      status: flag("status"),
    };
  }

  function applyKindMetadataUserEdited(panel, kind, flags) {
    if (!flags) return;
    const apply = (suffix, key) => {
      if (!flags[key]) return;
      const el = panel.querySelector(`#mg-meta-${kind}-${suffix}`);
      if (el) el.dataset.userEdited = "true";
    };
    apply("default-price", "defaultPrice");
    apply("vf-count", "vfCount");
    apply("vo-count", "voCount");
    apply("publisher", "publisher");
    apply("status", "status");
  }

  function readKindMetadataOverrides(panel, kind) {
    const read = (selector) => panel.querySelector(selector);
    const vfRaw = read(`#mg-meta-${kind}-vf-count`)?.value.trim();
    const voRaw = read(`#mg-meta-${kind}-vo-count`)?.value.trim();
    return {
      defaultPrice: parsePriceInput(read(`#mg-meta-${kind}-default-price`)?.value || ""),
      publisherVf: read(`#mg-meta-${kind}-publisher`)?.value.trim() || null,
      volumesVfCount: vfRaw ? Number(vfRaw) : null,
      volumesVoTotal: voRaw ? Number(voRaw) : null,
      readingStatus: read(`#mg-meta-${kind}-status`)?.value.trim() || null,
      priceFormat: read(`#mg-meta-${kind}-price-format`)?.value.trim() || null,
    };
  }

  function readSharedMetadataOverrides(panel) {
    const read = (selector) => panel.querySelector(selector);
    return {
      title: read("#mg-meta-title")?.value.trim() || null,
      genres: readTagListFromInput(read("#mg-meta-genres")?.value || ""),
      themes: readTagListFromInput(read("#mg-meta-themes")?.value || ""),
      synopsis: read("#mg-meta-synopsis")?.value.trim() || null,
      coverUrl: read("#mg-meta-cover")?.value.trim() || null,
      demographicType: read("#mg-meta-demographic")?.value.trim() || null,
    };
  }

  function readMetadataOverrides(panel) {
    return {
      shared: readSharedMetadataOverrides(panel),
      chapter: panel.querySelector("#mg-meta-kind-chapter")
        ? readKindMetadataOverrides(panel, "chapter")
        : null,
      volume: panel.querySelector("#mg-meta-kind-volume")
        ? readKindMetadataOverrides(panel, "volume")
        : null,
    };
  }

  function resolveMetadataOverridesForKind(allOverrides, kind) {
    if (!allOverrides) return null;
    if (allOverrides.shared) {
      const kindData = allOverrides[kind] || {};
      const { userEdited: _ignored, ...kindOverrides } = kindData;
      return { ...allOverrides.shared, ...kindOverrides };
    }
    return allOverrides;
  }

  function captureMetadataFormState(panel) {
    return {
      shared: readSharedMetadataOverrides(panel),
      chapter: panel.querySelector("#mg-meta-kind-chapter")
        ? {
            ...readKindMetadataOverrides(panel, "chapter"),
            userEdited: readKindMetadataUserEdited(panel, "chapter"),
          }
        : null,
      volume: panel.querySelector("#mg-meta-kind-volume")
        ? {
            ...readKindMetadataOverrides(panel, "volume"),
            userEdited: readKindMetadataUserEdited(panel, "volume"),
          }
        : null,
    };
  }

  function buildKindMetaSectionHtml(kind, profile, preserved = {}, metaEditionId = null) {
    const isChapter = kind === "chapter";
    const manualEdition = Boolean(profile.manualEditionOnly);
    const heading = isChapter
      ? manualEdition
        ? "Chapitres (scan / trad — à compléter)"
        : "Chapitres VF"
      : manualEdition
        ? "Tomes (scan / trad — à compléter)"
        : "Tomes VF";
    const priceFormat = preserved.priceFormat || profile.priceFormat || "broche";
    const readingStatus = preserved.readingStatus || "";
    const publisher = preserved.publisherVf || "";
    const defaultPrice =
      preserved.defaultPrice != null ? preserved.defaultPrice : "";
    const vfCount = preserved.volumesVfCount ?? "";
    const voCount = preserved.volumesVoTotal ?? "";

    /* Editions disponibles comme source de métadonnées (excl. metadata-only). */
    const sourceEditions = (profile.editions || []).filter((e) => !e.metadataOnly);
    const showSourceSelect = sourceEditions.length > 1;
    const sourceSelectHtml = showSourceSelect
      ? `<div style="margin-bottom:8px;display:flex;align-items:center;gap:8px;font-size:0.82rem">
          <span style="color:#9aa0a6;flex-shrink:0">Source métadonnées :</span>
          <select id="mg-meta-${kind}-source-edition" title="Édition de référence pour éditeur, compteurs, statut et prix" style="${MG_META_INPUT_STYLE};flex:1">
            ${sourceEditions
              .map(
                (e) =>
                  `<option value="${escapeHtml(e.id)}" ${e.id === metaEditionId ? "selected" : ""}>${escapeHtml(formatEditionChoiceLabel(e))}</option>`,
              )
              .join("")}
          </select>
        </div>`
      : "";

    return `
      <details class="mg-meta-kind-block" id="mg-meta-kind-${kind}" open>
        <summary>${heading}</summary>
        ${sourceSelectHtml}
        <div class="mg-meta-grid-2col" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem">
          <label style="display:flex;flex-direction:column;gap:4px">Prix défaut (€)
            <input id="mg-meta-${kind}-default-price" type="text" value="${escapeHtml(typeof defaultPrice === "number" ? formatPriceInputValue(defaultPrice) : String(defaultPrice))}" style="${MG_META_INPUT_STYLE}"/>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px">Format prix
            <select id="mg-meta-${kind}-price-format" style="${MG_META_INPUT_STYLE}">
              <option value="broche" ${priceFormat === "broche" ? "selected" : ""}>Broché</option>
              <option value="numerique" ${priceFormat === "numerique" ? "selected" : ""}>Numérique</option>
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px">${isChapter ? "Nb chapitres VF" : "Nb tomes VF"}
            <input id="mg-meta-${kind}-vf-count" type="number" min="0" value="${vfCount !== "" && vfCount != null ? vfCount : ""}" style="${MG_META_INPUT_STYLE}"/>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px">${isChapter ? "Nb chapitres VO" : "Nb tomes VO"}
            <input id="mg-meta-${kind}-vo-count" type="number" min="0" value="${voCount !== "" && voCount != null ? voCount : ""}" style="${MG_META_INPUT_STYLE}"/>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px">${
            manualEdition ? "Éditeur / groupe (ex. scan trad)" : "Éditeur VF"
          }
            <input id="mg-meta-${kind}-publisher" type="text" value="${escapeHtml(publisher)}" placeholder="${manualEdition ? "Nom du scan, groupe de trad…" : ""}" style="${MG_META_INPUT_STYLE}"/>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px">Statut VF
            <select id="mg-meta-${kind}-status" style="${MG_META_INPUT_STYLE}">
              <option value="">—</option>
              <option value="ongoing" ${readingStatus === "ongoing" ? "selected" : ""}>En cours</option>
              <option value="completed" ${readingStatus === "completed" ? "selected" : ""}>Terminé</option>
              <option value="on_hold" ${readingStatus === "on_hold" ? "selected" : ""}>En pause</option>
              <option value="dropped" ${readingStatus === "dropped" ? "selected" : ""}>Abandonné</option>
            </select>
          </label>
        </div>
      </details>`;
  }

  function buildSharedMetadataHtml(meta, preserved = {}) {
    const title = preserved.title ?? extractTitle();
    const genres = resolvePreservedTagList(preserved.genres, () =>
      extractTaggedListFromDoc(document, META_KEYS.GENRES),
    );
    const themes = resolvePreservedTagList(preserved.themes, () =>
      extractTaggedListFromDoc(document, META_KEYS.THEMES),
    );
    const synopsis = preserved.synopsis ?? extractSynopsis() ?? "";
    const coverUrl = preserved.coverUrl ?? extractCoverUrl() ?? "";
    const demographic = preserved.demographicType ?? meta[META_KEYS.TYPE] ?? "";

    return `
      <p class="mg-meta-shared-title">Commun aux deux séries</p>
      <div class="mg-meta-title-demographic-row" style="display:grid;grid-template-columns:7fr 3fr;gap:8px;font-size:0.85rem;margin-bottom:8px">
        <label style="display:flex;flex-direction:column;gap:4px">Titre
          <input id="mg-meta-title" type="text" value="${escapeHtml(title)}" style="${MG_META_INPUT_STYLE}"/>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px">Démographie
          <input id="mg-meta-demographic" type="text" value="${escapeHtml(demographic)}" placeholder="Seinen, Shōnen…" style="${MG_META_INPUT_STYLE}"/>
        </label>
      </div>
      <div class="mg-meta-grid-2col" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem">
        <label style="grid-column:1/-1;display:flex;flex-direction:column;gap:4px">Genres (virgules)
          <input id="mg-meta-genres" type="text" value="${escapeHtml((Array.isArray(genres) ? genres : []).join(", "))}" style="${MG_META_INPUT_STYLE}"/>
        </label>
        <label style="grid-column:1/-1;display:flex;flex-direction:column;gap:4px">Thèmes (virgules)
          <input id="mg-meta-themes" type="text" value="${escapeHtml((Array.isArray(themes) ? themes : []).join(", "))}" style="${MG_META_INPUT_STYLE}"/>
        </label>
        <label style="grid-column:1/-1;display:flex;flex-direction:column;gap:4px">Synopsis
          <textarea id="mg-meta-synopsis" rows="3" style="${MG_META_INPUT_STYLE};resize:vertical">${escapeHtml(synopsis)}</textarea>
        </label>
        <label style="grid-column:1/-1;display:flex;flex-direction:column;gap:4px">URL couverture
          <input id="mg-meta-cover" type="text" value="${escapeHtml(coverUrl)}" style="${MG_META_INPUT_STYLE}"/>
        </label>
      </div>`;
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

  function showImportSelectionModal(catalog, options = { purpose: "app" }) {
    return new Promise((resolve, reject) => {
      const { chapter, volume, meta } = catalog;
      if (!chapter.available && !volume.available) {
        reject(
          new Error(
            "Aucun chapitre ni tome détecté sur cette fiche (VF ou VO).",
          ),
        );
        return;
      }

      const onlyChapter = chapter.available && !volume.available;
      const onlyVolume = volume.available && !chapter.available;
      let chapterEditionId = chapter.defaultEditionId;
      let volumeEditionId = volume.defaultEditionId;
      /** Edition source des métadonnées (éditeur, compteurs, statut, prix défaut) — peut différer de l'édition des tomes. */
      let chapterMetaEditionId = chapter.defaultEditionId;
      let volumeMetaEditionId = volume.defaultEditionId;
      const isMobile = isMobileBrowser();

      const overlay = document.createElement("div");
      overlay.id = "mangatheque-import-modal";
      if (isMobile) {
        overlay.classList.add("mg-touch-layout");
      }
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:999999;pointer-events:none;font:14px/1.45 Segoe UI,sans-serif;color:#e8eaed;";
      injectImportModalStyles(overlay);

      const panel = document.createElement("div");
      panel.style.cssText = isMobile
        ? "position:fixed;left:0;right:0;bottom:0;top:auto;width:100%;max-height:92vh;display:flex;flex-direction:column;pointer-events:auto;background:#1a1d26;border:1px solid #2d3340;border-top:1px solid #3d4452;border-radius:12px 12px 0 0;box-shadow:0 -8px 32px rgba(0,0,0,.6);overflow:hidden;"
        : "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(780px,calc(100vw - 24px));max-height:min(90vh,780px);display:flex;flex-direction:column;pointer-events:auto;background:#1a1d26;border:1px solid #2d3340;border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,.55);overflow:hidden;";

      const seriesTitle = extractTitle() || "Sans titre";
      const header = document.createElement("header");
      header.className = "mg-drag-handle";
      header.style.cssText = isMobile
        ? "flex:0 0 auto;padding:14px 16px 12px;border-bottom:1px solid #2d3340;background:#1a1d26;user-select:none;z-index:2;"
        : "flex:0 0 auto;padding:12px 16px 10px;border-bottom:1px solid #2d3340;background:#1a1d26;cursor:move;user-select:none;z-index:2;";
      header.innerHTML = isMobile
        ? `<div style="width:36px;height:4px;border-radius:2px;background:#3d4452;margin:0 auto 4px;display:block"></div>
           <div class="mg-mobile-header-row">
            <h2 id="mg-modal-title" style="margin:0;font-size:1rem;line-height:1.3">${escapeHtml(seriesTitle)}</h2>
            <button type="button" class="mg-mobile-minimize-btn" aria-label="Réduire la modale" title="Réduire pour lire la page Nautiljon">▼</button>
           </div>`
        : `<h2 id="mg-modal-title" style="margin:0;font-size:1.05rem;line-height:1.3">Import Mangathèque — ${escapeHtml(seriesTitle)}</h2>`;
      if (isMobile) {
        panel.classList.add("mg-mobile-panel");
        const minimizeBtn = header.querySelector(".mg-mobile-minimize-btn");
        if (minimizeBtn instanceof HTMLButtonElement) {
          minimizeBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const minimized = panel.classList.toggle("mg-panel-minimized");
            minimizeBtn.textContent = minimized ? "▲" : "▼";
            minimizeBtn.setAttribute(
              "aria-label",
              minimized ? "Agrandir la modale" : "Réduire la modale",
            );
            minimizeBtn.title = minimized
              ? "Agrandir la modale d'import"
              : "Réduire pour lire la page Nautiljon";
          });
        }
      }
      if (!isMobile) {
        makeDraggablePanel(panel, header);
      }

      const scrollBody = document.createElement("div");
      scrollBody.className = "mg-modal-body";
      scrollBody.style.cssText = isMobile
        ? "flex:1 1 auto;min-height:0;overflow-y:auto;padding:12px 14px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;"
        : "flex:1 1 auto;min-height:0;overflow-y:auto;padding:12px 16px;overscroll-behavior:contain;";

      const footer = document.createElement("footer");
      footer.className = "mg-modal-footer";
      footer.style.cssText = isMobile
        ? "flex:0 0 auto;padding:10px 14px 18px;border-top:1px solid #2d3340;background:#1a1d26;z-index:2;"
        : "flex:0 0 auto;padding:10px 16px 14px;border-top:1px solid #2d3340;background:#1a1d26;z-index:2;";

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
        titleEl.textContent = isMobile ? label : `Import Mangathèque — ${label}`;
      }

      const volumeDetailsCache = new Map();

      /*
       * Artbook : pré-remplissage du cache avec les données déjà disponibles
       * sur la page courante — évite un XHR redondant vers la même URL.
       * La clé est window.location.href car entryId = href dans parseVolumeNode.
       */
      if (volume.isArtbook && volume.artbookCache) {
        volumeDetailsCache.set(window.location.href, volume.artbookCache);
      }

      let prefetchToken = 0;

      function getDefaultCatalogPrice(kind) {
        const input = panel.querySelector(`#mg-meta-${kind}-default-price`);
        if (input instanceof HTMLInputElement) {
          const parsed = parsePriceInput(input.value);
          if (parsed != null) {
            return parsed;
          }
        }
        const edition = getEditionForKind(kind);
        return inferEditionDefaultPrice(edition) ?? null;
      }

      /** @description Applique le prix défaut série aux tomes non modifiés manuellement. */
      function propagateDefaultPriceToVolumes(kind) {
        const price = getDefaultCatalogPrice(kind);
        if (price == null) {
          return;
        }

        for (const input of panel.querySelectorAll(
          `.mg-vol-price[data-kind="${kind}"]`,
        )) {
          if (!(input instanceof HTMLInputElement)) {
            continue;
          }
          if (isPriceInputUserEdited(input)) {
            continue;
          }
          if (input.dataset.editionType === "collector") {
            continue;
          }
          input.value = formatPriceInputValue(price);
          input.placeholder = `${formatPriceInputValue(price)} €`;
        }
      }

      /** @description Valeurs par défaut des métadonnées spécifiques à un type. */
      function buildKindMetaDefaults(kind) {
        const profile = kind === "chapter" ? chapter : volume;
        const edition = getMetadataEdition(kind);
        /* Passe meta en fallback : éditeur et prix depuis la fiche principale quand le bloc est vide. */
        const publisher = extractEditionPublisherLabel(edition, meta) || "";
        const defaultPrice =
          inferEditionDefaultPrice(edition) ?? parsePriceEur(meta[META_KEYS.PRICE] || "") ?? null;
        return {
          publisherVf: publisher,
          defaultPrice,
          volumesVfCount: getEditionVfCount(edition, profile),
          volumesVoTotal: getProfileVoCount(profile, edition),
          readingStatus: getEditionReadingStatus(edition, profile) || "",
          priceFormat: profile.priceFormat || "broche",
        };
      }

      function wireMetadataListeners() {
        if (panel.dataset.metaListenersWired === "true") {
          return;
        }
        panel.dataset.metaListenersWired = "true";

        panel.addEventListener("input", (event) => {
          const target = event.target;
          if (!(target instanceof HTMLInputElement)) return;
          if (target.id === "mg-meta-title") {
            syncModalTitleFromForm();
          }
          const kindMatch = target.id?.match(
            /^mg-meta-(chapter|volume)-(vf-count|vo-count|publisher|default-price)$/,
          );
          if (kindMatch) {
            target.dataset.userEdited = "true";
          }
        });

        panel.addEventListener("blur", (event) => {
          const target = event.target;
          if (!(target instanceof HTMLInputElement)) return;
          if (target.id === "mg-meta-title") {
            syncModalTitleFromForm();
          }
          const kindMatch = target.id?.match(
            /^mg-meta-(chapter|volume)-default-price$/,
          );
          if (kindMatch) {
            propagateDefaultPriceToVolumes(kindMatch[1]);
          }
        }, true);

        panel.addEventListener("change", (event) => {
          const target = event.target;
          if (target instanceof HTMLInputElement) {
            const kindMatch = target.id?.match(
              /^mg-meta-(chapter|volume)-default-price$/,
            );
            if (kindMatch) {
              propagateDefaultPriceToVolumes(kindMatch[1]);
            }
          }
          if (target instanceof HTMLSelectElement) {
            const statusMatch = target.id?.match(/^mg-meta-(chapter|volume)-status$/);
            if (statusMatch) {
              target.dataset.userEdited = "true";
            }
            const formatMatch = target.id?.match(
              /^mg-meta-(chapter|volume)-price-format$/,
            );
            if (formatMatch && target.value === "numerique") {
              propagateDefaultPriceToVolumes(formatMatch[1]);
            }
            /* Changement de la source de métadonnées : recharge les champs. */
            const sourceMatch = target.id?.match(
              /^mg-meta-(chapter|volume)-source-edition$/,
            );
            if (sourceMatch) {
              const k = sourceMatch[1];
              if (k === "chapter") chapterMetaEditionId = target.value;
              else volumeMetaEditionId = target.value;
              syncKindMetaFromEdition(k, { forceCounts: true, forcePrice: true });
            }
          }
        });
      }

      function renderMetadataSection() {
        const content = panel.querySelector("#mg-metadata-content");
        if (!content) return;

        const preserved = captureMetadataFormState(panel);
        const ficheSeuleOn = isFicheSeuleEnabled();
        const chapterOn = isProfileEnabled("chapter") || (ficheSeuleOn && chapter.available);
        const volumeOn = isProfileEnabled("volume") || (ficheSeuleOn && volume.available);
        const bothOn = chapterOn && volumeOn;

        let html = buildSharedMetadataHtml(meta, preserved.shared || {});
        if (ficheSeuleOn) {
          html +=
            '<p class="mg-fiche-seule-hint" style="margin:0 0 10px;padding:8px 10px;border-radius:8px;border:1px solid #3d4452;background:rgba(99,102,241,.12);color:#c7d2fe;font-size:0.82rem;line-height:1.4">Mode fiche seule : métadonnées uniquement, sans édition ni liste de tomes/chapitres. Dans Mangathèque, basculez Tomes ↔ Chapitres selon le besoin (scan / trad).</p>';
        }
        if (chapterOn) {
          const chapterPreserved = preserved.chapter || {};
          const { userEdited: chapterEdited, ...chapterValues } = chapterPreserved;
          html += buildKindMetaSectionHtml("chapter", chapter, {
            ...buildKindMetaDefaults("chapter"),
            ...chapterValues,
          }, chapterMetaEditionId);
        }
        if (volumeOn) {
          const volumePreserved = preserved.volume || {};
          const { userEdited: volumeEdited, ...volumeValues } = volumePreserved;
          html += buildKindMetaSectionHtml("volume", volume, {
            ...buildKindMetaDefaults("volume"),
            ...volumeValues,
          }, volumeMetaEditionId);
        }

        content.innerHTML = html;

        if (chapterOn) {
          applyKindMetadataUserEdited(panel, "chapter", preserved.chapter?.userEdited);
        }
        if (volumeOn) {
          applyKindMetadataUserEdited(panel, "volume", preserved.volume?.userEdited);
        }

        const sharedTitle = content.querySelector(".mg-meta-shared-title");
        if (sharedTitle instanceof HTMLElement) {
          sharedTitle.style.display = bothOn || ficheSeuleOn ? "block" : "none";
        }

        wireMetadataListeners();
        syncModalTitleFromForm();
      }

      const dragHandle = header;

      const typeSection = createCollapsibleSection("1. Type de contenu", {
        open: true,
        id: "mg-type-section",
      });
      const editionSection = createCollapsibleSection("2. Édition", {
        open: true,
        id: "mg-edition-section",
      });
      const metadataBlock = createMetadataSectionShell();
      const ownershipSection = createCollapsibleSection("4. Appartenance", {
        open: true,
        id: "mg-ownership-section",
      });
      const volumesSection = createCollapsibleSection("5. Liste des tomes / chapitres", {
        open: true,
        id: "mg-volumes-section",
      });

      scrollBody.append(
        typeSection.details,
        editionSection.details,
        metadataBlock,
        ownershipSection.details,
        volumesSection.details,
      );

      const profilesBlock = typeSection.content;
      const editionsBlock = editionSection.content;
      const ownershipBlock = ownershipSection.content;
      ownershipBlock.id = "mg-ownership-block";

      const purchaseRow = document.createElement("div");
      purchaseRow.className = "mg-ownership-row";
      purchaseRow.style.cssText =
        "display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 10px";
      purchaseRow.innerHTML =
        '<span style="min-width:52px;font-weight:600;font-size:0.88rem">Achat</span><span style="font-size:0.78rem;color:#9aa0a6">(tous les tomes cochés)</span>';
      const purchaseWrap = document.createElement("div");
      purchaseWrap.style.cssText = "display:flex;flex-wrap:wrap;gap:8px";
      for (const ownerName of OWNER_OPTIONS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mg-owner-toggle-btn mg-purchase-owner-btn";
        btn.dataset.owner = ownerName;
        btn.textContent = ownerName;
        btn.disabled = true;
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          if (btn.disabled) return;
          togglePurchaseOwner(ownerName);
        });
        purchaseWrap.appendChild(btn);
      }
      purchaseRow.appendChild(purchaseWrap);
      ownershipBlock.appendChild(purchaseRow);

      const sharedPurchaseRow = document.createElement("div");
      sharedPurchaseRow.className = "mg-shared-purchase-row";
      sharedPurchaseRow.id = "mg-global-shared-row";
      sharedPurchaseRow.innerHTML =
        '<span style="font-weight:600;font-size:0.82rem;color:#e8eaed">Partagé</span><span style="font-size:0.76rem;color:#9aa0a6">Coût divisé entre les acheteurs cochés</span>';
      const globalSharedLabel = document.createElement("label");
      globalSharedLabel.className = "mg-shared-toggle";
      const globalSharedInput = document.createElement("input");
      globalSharedInput.type = "checkbox";
      globalSharedInput.id = "mg-global-shared-purchase";
      globalSharedInput.checked = true;
      globalSharedInput.addEventListener("change", () => {
        globalSharedPurchase = globalSharedInput.checked;
        for (const entryId of perVolumePurchase.keys()) {
          if ((perVolumePurchase.get(entryId)?.size ?? 0) >= 2) {
            perVolumeSharedPurchase.set(entryId, globalSharedPurchase);
            refreshSharedPurchaseForEntry(entryId);
          }
        }
      });
      globalSharedLabel.append(globalSharedInput, document.createTextNode(" Activé"));
      sharedPurchaseRow.appendChild(globalSharedLabel);
      ownershipBlock.appendChild(sharedPurchaseRow);

      const mihonRow = document.createElement("div");
      mihonRow.className = "mg-ownership-row";
      mihonRow.style.cssText =
        "display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0";
      mihonRow.innerHTML =
        '<span style="min-width:52px;font-weight:600;font-size:0.88rem;color:#22d3ee">Mihon</span><span style="font-size:0.78rem;color:#9aa0a6">(tous les tomes cochés)</span>';
      const mihonOwnersWrap = document.createElement("div");
      mihonOwnersWrap.style.cssText = "display:flex;flex-wrap:wrap;gap:8px";
      for (const ownerName of OWNER_OPTIONS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mg-owner-toggle-btn mg-mihon-global-btn";
        btn.dataset.owner = ownerName;
        btn.textContent = ownerName;
        btn.disabled = true;
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          if (btn.disabled) return;
          if (globalMihonOwner === ownerName) {
            setGlobalMihonOwner(null);
          } else {
            setGlobalMihonOwner(ownerName);
          }
        });
        mihonOwnersWrap.appendChild(btn);
      }
      mihonRow.appendChild(mihonOwnersWrap);
      ownershipBlock.appendChild(mihonRow);

      const ownershipHint = document.createElement("p");
      ownershipHint.style.cssText = "margin:10px 0 0;font-size:0.78rem;color:#9aa0a6;line-height:1.4";
      ownershipHint.textContent =
        "Achat et Mihon peuvent coexister. Les boutons globaux s'appliquent aux tomes cochés ; par tome, ajustez achat, Mihon et « Partagé » (2+ acheteurs).";
      ownershipBlock.appendChild(ownershipHint);

      const hint = document.createElement("p");
      hint.style.cssText = "margin:0 0 8px;color:#9aa0a6;font-size:0.85rem";
      volumesSection.content.appendChild(hint);

      const sectionsBlock = document.createElement("div");
      sectionsBlock.style.marginBottom = "8px";
      volumesSection.content.appendChild(sectionsBlock);

      const conflictsBlock = document.createElement("div");
      conflictsBlock.style.marginBottom = "0";
      volumesSection.content.appendChild(conflictsBlock);

      const actions = document.createElement("div");
      actions.className = "mg-modal-footer-actions";

      const footerLeft = document.createElement("div");
      const footerRight = document.createElement("div");
      footerRight.className = "mg-modal-footer-right";

      const footerStatus = document.createElement("p");
      footerStatus.id = "mg-footer-status";
      footerStatus.className = "mg-footer-status";

      function setFooterStatus(message, kind = "error") {
        if (!message) {
          footerStatus.style.display = "none";
          footerStatus.textContent = "";
          return;
        }
        footerStatus.style.display = "block";
        footerStatus.style.color =
          kind === "success" ? "#34d399" : kind === "error" ? "#f87171" : "#9aa0a6";
        footerStatus.textContent = message;
      }

      const btnBase =
        "padding:10px 16px;border-radius:8px;cursor:pointer;font-size:0.9rem;";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.textContent = "Annuler";
      cancelBtn.style.cssText =
        `${btnBase}border:1px solid #2d3340;background:#12141a;color:#e8eaed;`;

      const exportBtn = document.createElement("button");
      exportBtn.type = "button";
      exportBtn.className = "mg-export-json-btn";
      exportBtn.textContent = "Télécharger JSON";
      exportBtn.title = isMobile
        ? "Télécharge un fichier JSON — importez-le dans Mangathèque (bouton Importer .json)"
        : "Télécharge le JSON si l'envoi vers Mangathèque échoue";

      const reviewBtn = document.createElement("button");
      reviewBtn.type = "button";
      reviewBtn.textContent = "Envoi + contrôle app";
      reviewBtn.title = "Ouvre la modale Mangathèque pour vérifier avant enregistrement";
      reviewBtn.style.cssText =
        `${btnBase}border:0;background:#6366f1;color:#fff;font-weight:600;`;

      const directBtn = document.createElement("button");
      directBtn.type = "button";
      directBtn.textContent = "Envoi direct";
      directBtn.title = "Crée la série immédiatement sans modale de contrôle";
      directBtn.style.cssText =
        `${btnBase}border:0;background:#059669;color:#fff;font-weight:600;`;

      footerLeft.appendChild(exportBtn);
      if (isMobile) {
        /* Sur mobile, les boutons d'envoi sont inutiles (pas de serveur local 127.0.0.1). */
        footerRight.append(cancelBtn);
      } else {
        footerRight.append(cancelBtn, reviewBtn, directBtn);
      }
      actions.append(footerLeft, footerRight);
      footer.append(footerStatus, actions);

      const conflictChoices = { chapter: {}, volume: {} };
      const profileToggle = { chapter: null, volume: null };
      /** @type {HTMLInputElement | null} */
      let ficheSeuleToggle = null;
      const perVolumeMihon = new Map();
      const perVolumePurchase = new Map();
      const perVolumeSharedPurchase = new Map();
      let globalMihonOwner = null;
      let globalSharedPurchase = true;
      const selectedPurchaseOwners = new Set();

      function renderTypeSection() {
        profilesBlock.innerHTML = "";
        const bothAvailable = chapter.available && volume.available;
        const row = document.createElement("div");
        row.className = `mg-type-toggle-row${
          bothAvailable ? " mg-type-toggle-row--dual" : " mg-type-toggle-row--single"
        }`;

        function createTypeToggle(profile, label, defaultChecked) {
          if (!profile.available) return null;
          const labelEl = document.createElement("label");
          labelEl.className = "mg-type-toggle-item";
          const input = document.createElement("input");
          input.type = "checkbox";
          input.className = "mg-profile-toggle";
          input.dataset.kind = profile.contentKind;
          input.checked = defaultChecked;
          profileToggle[profile.contentKind] = input;
          const text = document.createElement("span");
          text.innerHTML = `<strong>${label}</strong> <span style="color:#9aa0a6;font-size:0.82rem">(${formatProfileSummary(profile)})</span>`;
          labelEl.append(input, text);
          return labelEl;
        }

        const chapterDefault =
          onlyChapter ||
          (bothAvailable && meta[META_KEYS.WEBCOMIC] === "Oui");
        const volumeDefault =
          onlyVolume ||
          (bothAvailable && meta[META_KEYS.WEBCOMIC] !== "Oui");

        const chapterLabel = chapter.manualEditionOnly
          ? "Chapitres"
          : "Chapitres VF";
        const volumeLabel = volume.manualEditionOnly ? "Tomes" : "Tomes VF";

        if (bothAvailable) {
          const colLeft = document.createElement("div");
          colLeft.className = "mg-type-toggle-col";
          const colRight = document.createElement("div");
          colRight.className = "mg-type-toggle-col";
          const chapterToggle = createTypeToggle(chapter, chapterLabel, chapterDefault);
          const volumeToggle = createTypeToggle(volume, volumeLabel, volumeDefault);
          if (chapterToggle) colLeft.appendChild(chapterToggle);
          if (volumeToggle) colRight.appendChild(volumeToggle);
          row.append(colLeft, colRight);
        } else {
          const col = document.createElement("div");
          col.className = "mg-type-toggle-col";
          const chapterToggle = createTypeToggle(chapter, chapterLabel, chapterDefault);
          const volumeToggle = createTypeToggle(volume, volumeLabel, volumeDefault);
          if (chapterToggle) col.appendChild(chapterToggle);
          if (volumeToggle) col.appendChild(volumeToggle);
          row.appendChild(col);
        }

        profilesBlock.appendChild(row);

        const ficheRow = document.createElement("div");
        ficheRow.className = "mg-type-toggle-row mg-type-toggle-row--single";
        ficheRow.style.marginTop = "8px";
        const ficheCol = document.createElement("div");
        ficheCol.className = "mg-type-toggle-col";
        const ficheLabel = document.createElement("label");
        ficheLabel.className = "mg-type-toggle-item";
        const ficheInput = document.createElement("input");
        ficheInput.type = "checkbox";
        ficheInput.className = "mg-fiche-seule-toggle";
        ficheInput.checked = false;
        ficheSeuleToggle = ficheInput;
        const ficheText = document.createElement("span");
        ficheText.innerHTML =
          '<strong>Fiche seule</strong> <span style="color:#9aa0a6;font-size:0.82rem">(métadonnées sans édition — idéal scan / trad)</span>';
        ficheLabel.append(ficheInput, ficheText);
        ficheCol.appendChild(ficheLabel);
        ficheRow.appendChild(ficheCol);
        profilesBlock.appendChild(ficheRow);
      }

      function renderEditionSection() {
        editionsBlock.innerHTML = "";

        if (isFicheSeuleEnabled()) {
          editionsBlock.innerHTML =
            '<p style="margin:0;color:#9aa0a6;font-size:0.85rem;text-align:center">Fiche seule : aucune édition à choisir. Les compteurs restent éditables dans « Fiche série ».</p>';
          return;
        }

        if (!hasImportableProfileSelected()) {
          editionsBlock.innerHTML =
            '<p style="margin:0;color:#9aa0a6;font-size:0.85rem;text-align:center">Sélectionnez d\'abord un type de contenu.</p>';
          return;
        }

        function createEditionGroup(kind, profile) {
          if (!isProfileEnabled(kind) || profile.editions.length === 0) return null;

          const wrap = document.createElement("div");
          wrap.className = "mg-edition-group";
          const title = document.createElement("p");
          title.className = "mg-edition-group-title";
          title.textContent = kind === "chapter" ? "Édition chapitres" : "Édition tomes";
          wrap.appendChild(title);

          if (profile.editions.length === 1) {
            const edition = profile.editions[0];
            const p = document.createElement("p");
            p.className = "mg-edition-group-value";
            p.textContent = formatEditionChoiceLabel(edition);
            wrap.appendChild(p);
          } else {
            for (const edition of profile.editions) {
              const el = document.createElement("label");
              el.className = "mg-edition-choice";
              const selectedId =
                kind === "chapter" ? chapterEditionId : volumeEditionId;
              el.innerHTML = `<input type="radio" name="mg-edition-${kind}" value="${edition.id}" ${edition.id === selectedId ? "checked" : ""}/> <span>${formatEditionChoiceLabel(edition)}</span>`;
              wrap.appendChild(el);
            }
          }
          return wrap;
        }

        const chapterGroup = createEditionGroup("chapter", chapter);
        const volumeGroup = createEditionGroup("volume", volume);

        if (!chapterGroup && !volumeGroup) {
          editionsBlock.innerHTML =
            '<p style="margin:0;color:#9aa0a6;font-size:0.85rem;text-align:center">Aucune édition détectée.</p>';
          return;
        }

        const bothVisible = Boolean(chapterGroup && volumeGroup);
        const row = document.createElement("div");
        row.className = `mg-type-toggle-row${
          bothVisible ? " mg-type-toggle-row--dual" : " mg-type-toggle-row--single"
        }`;

        if (bothVisible) {
          const colLeft = document.createElement("div");
          colLeft.className = "mg-type-toggle-col";
          const colRight = document.createElement("div");
          colRight.className = "mg-type-toggle-col";
          colLeft.appendChild(chapterGroup);
          colRight.appendChild(volumeGroup);
          row.append(colLeft, colRight);
        } else {
          const col = document.createElement("div");
          col.className = "mg-type-toggle-col";
          col.appendChild(chapterGroup || volumeGroup);
          row.appendChild(col);
        }

        editionsBlock.appendChild(row);
      }

      renderTypeSection();

      function getEditionForKind(kind) {
        const profile = kind === "chapter" ? chapter : volume;
        const editionId = kind === "chapter" ? chapterEditionId : volumeEditionId;
        return (
          profile.editions.find((edition) => edition.id === editionId) ||
          profile.editions[0] ||
          null
        );
      }

      /** @description Bloc source pour éditeur / compteurs — suit l'édition sélectionnée ou l'override "Source" du select dédié. */
      function getMetadataEdition(kind) {
        const profile = kind === "chapter" ? chapter : volume;
        const sourceId = kind === "chapter" ? chapterMetaEditionId : volumeMetaEditionId;
        return resolveMetadataEdition(profile, kind, sourceId);
      }

      function isProfileEnabled(kind) {
        return Boolean(profileToggle[kind]?.checked);
      }

      /**
       * @description Mode import métadonnées seules (sans édition ni liste).
       */
      function isFicheSeuleEnabled() {
        return Boolean(ficheSeuleToggle?.checked);
      }

      function hasImportableProfileSelected() {
        return isProfileEnabled("chapter") || isProfileEnabled("volume");
      }

      /**
       * @description Indique si un envoi / export est possible (type ou fiche seule).
       */
      function canSubmitImport() {
        return hasImportableProfileSelected() || isFicheSeuleEnabled();
      }

      /**
       * @description Active le mode fiche seule et désactive chapitres / tomes.
       */
      function setFicheSeuleEnabled(enabled) {
        if (ficheSeuleToggle) {
          ficheSeuleToggle.checked = enabled;
        }
        if (enabled) {
          if (profileToggle.chapter) profileToggle.chapter.checked = false;
          if (profileToggle.volume) profileToggle.volume.checked = false;
        }
      }

      /**
       * @description Désactive la fiche seule dès qu'un type chapitre/tome est coché.
       */
      function clearFicheSeuleIfProfilesSelected() {
        if (!ficheSeuleToggle) return;
        if (hasImportableProfileSelected()) {
          ficheSeuleToggle.checked = false;
        }
      }

      function getPrimaryContentKind() {
        if (isProfileEnabled("volume")) return "volume";
        if (isProfileEnabled("chapter")) return "chapter";
        return "volume";
      }

      function getVfCountForKind(kind) {
        const profile = kind === "chapter" ? chapter : volume;
        const edition = getMetadataEdition(kind);
        return getEditionVfCount(edition, profile);
      }

      /** @description Alimente la fiche série depuis le type et l'édition actifs. */
      function syncMetaFromSelection({ forceCounts = false, forcePrice = false } = {}) {
        for (const kind of ["chapter", "volume"]) {
          const profile = kind === "chapter" ? chapter : volume;
          const shouldSync =
            isProfileEnabled(kind) ||
            (isFicheSeuleEnabled() && profile.available);
          if (!shouldSync) continue;
          syncKindMetaFromEdition(kind, { forceCounts, forcePrice });
        }
      }

      /** @description Met à jour les champs spécifiques d'un type depuis l'édition sélectionnée. */
      function syncKindMetaFromEdition(
        kind,
        { forceCounts = false, forcePrice = false } = {},
      ) {
        const profile = kind === "chapter" ? chapter : volume;
        const edition = getMetadataEdition(kind);
        if (!edition) return;

        const vfInput = panel.querySelector(`#mg-meta-${kind}-vf-count`);
        const voInput = panel.querySelector(`#mg-meta-${kind}-vo-count`);
        const statusSelect = panel.querySelector(`#mg-meta-${kind}-status`);
        const priceFormatSelect = panel.querySelector(
          `#mg-meta-${kind}-price-format`,
        );

        if (forceCounts || !vfInput?.dataset.userEdited) {
          const vfCount = getVfCountForKind(kind);
          if (vfInput instanceof HTMLInputElement && vfCount != null) {
            vfInput.value = String(vfCount);
          }
        }
        if (forceCounts || !voInput?.dataset.userEdited) {
          const voCount = getProfileVoCount(profile, edition);
          if (voInput instanceof HTMLInputElement && voCount != null) {
            voInput.value = String(voCount);
          }
        }
        if (
          statusSelect instanceof HTMLSelectElement &&
          (forceCounts || !statusSelect.dataset.userEdited)
        ) {
          const status = getEditionReadingStatus(edition, profile);
          if (status) statusSelect.value = status;
        }
        if (priceFormatSelect instanceof HTMLSelectElement) {
          if (kind === "chapter" && profile.priceFormat === "numerique") {
            priceFormatSelect.value = "numerique";
          } else if (kind === "volume") {
            priceFormatSelect.value = volume.priceFormat || "broche";
          }
        }

        const publisherInput = panel.querySelector(`#mg-meta-${kind}-publisher`);
        const publisher = extractEditionPublisherLabel(edition, meta);
        if (
          publisherInput instanceof HTMLInputElement &&
          publisher &&
          !publisherInput.dataset.userEdited
        ) {
          publisherInput.value = publisher;
        }

        const priceInput = panel.querySelector(`#mg-meta-${kind}-default-price`);
        const editionPrice =
          inferEditionDefaultPrice(edition) ?? parsePriceEur(meta[META_KEYS.PRICE] || "") ?? null;
        if (
          priceInput instanceof HTMLInputElement &&
          editionPrice != null &&
          (forcePrice || !priceInput.dataset.userEdited)
        ) {
          priceInput.value = formatPriceInputValue(editionPrice);
          propagateDefaultPriceToVolumes(kind);
        }
      }

      function isGlobalMihonModeActive() {
        return (
          Boolean(globalMihonOwner) &&
          (hasImportableProfileSelected() || isFicheSeuleEnabled())
        );
      }

      function syncGlobalSharedPurchaseRow() {
        const row = panel.querySelector("#mg-global-shared-row");
        if (!(row instanceof HTMLElement)) return;
        row.classList.toggle("is-visible", selectedPurchaseOwners.size >= 2);
      }

      function refreshSharedPurchaseForEntry(entryId) {
        const wrap = panel.querySelector(
          `.mg-vol-shared-wrap[data-entry-id="${entryId}"]`,
        );
        if (!(wrap instanceof HTMLElement)) return;
        const owners = perVolumePurchase.get(entryId);
        const show = (owners?.size ?? 0) >= 2;
        wrap.classList.toggle("is-visible", show);
        const input = wrap.querySelector('input[type="checkbox"]');
        if (input instanceof HTMLInputElement) {
          input.checked = resolveVolumeSharedPurchase(entryId, owners ? [...owners] : []);
        }
      }

      function resolveVolumeSharedPurchase(entryId, ownerNames) {
        if (!ownerNames || ownerNames.length < 2) return true;
        if (perVolumeSharedPurchase.has(entryId)) {
          return perVolumeSharedPurchase.get(entryId);
        }
        return globalSharedPurchase;
      }

      function readPerVolumeSharedOverrides() {
        const overrides = {};
        for (const [entryId, owners] of perVolumePurchase.entries()) {
          if (owners.size >= 2) {
            overrides[entryId] = resolveVolumeSharedPurchase(entryId, [...owners]);
          }
        }
        return overrides;
      }

      function createVolumeSharedControl(entryId) {
        const wrap = document.createElement("div");
        wrap.className = "mg-vol-shared-wrap";
        wrap.dataset.entryId = entryId;
        const label = document.createElement("label");
        label.className = "mg-shared-toggle";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = true;
        input.addEventListener("change", () => {
          perVolumeSharedPurchase.set(entryId, input.checked);
        });
        label.append(input, document.createTextNode(" Partagé"));
        wrap.appendChild(label);
        refreshSharedPurchaseForEntry(entryId);
        return wrap;
      }

      function refreshGlobalMihonButtons() {
        for (const btn of panel.querySelectorAll(".mg-mihon-global-btn")) {
          if (!(btn instanceof HTMLButtonElement)) continue;
          const owner = btn.dataset.owner || "";
          const active = globalMihonOwner === owner;
          btn.classList.toggle("is-active", active);
          applyOwnerButtonColors(btn, active, "mihon", owner);
        }
      }

      function refreshPurchaseButtons() {
        for (const btn of panel.querySelectorAll(".mg-purchase-owner-btn")) {
          if (!(btn instanceof HTMLButtonElement)) continue;
          const owner = btn.dataset.owner || "";
          const active = selectedPurchaseOwners.has(owner);
          btn.classList.toggle("is-active", active);
          applyOwnerButtonColors(btn, active, "purchase", owner);
        }
        syncGlobalSharedPurchaseRow();
      }

      function togglePurchaseOwner(ownerName) {
        if (selectedPurchaseOwners.has(ownerName)) {
          selectedPurchaseOwners.delete(ownerName);
        } else {
          selectedPurchaseOwners.add(ownerName);
        }
        if (selectedPurchaseOwners.size > 0) {
          applyGlobalPurchaseToCheckedVolumes();
        } else {
          clearGlobalPurchaseFromCheckedVolumes();
        }
        refreshPurchaseButtons();
        syncOwnershipBlockState();
      }

      function setGlobalMihonOwner(ownerName) {
        const previous = globalMihonOwner;
        globalMihonOwner = ownerName || null;
        refreshGlobalMihonButtons();
        if (globalMihonOwner) {
          if (previous && previous !== globalMihonOwner) {
            clearGlobalMihonForOwner(previous);
          }
          applyGlobalMihonToCheckedVolumes(globalMihonOwner);
        } else if (previous) {
          clearGlobalMihonForOwner(previous);
        }
        syncOwnershipBlockState();
      }

      function syncOwnershipBlockState() {
        const canConfigure =
          (chapter.available || volume.available) &&
          (hasImportableProfileSelected() || isFicheSeuleEnabled());
        ownershipSection.details.style.display =
          chapter.available || volume.available ? "block" : "none";
        ownershipSection.details.style.opacity = canConfigure ? "1" : "0.55";

        const purchaseButtons = panel.querySelectorAll(".mg-purchase-owner-btn");
        const mihonButtons = panel.querySelectorAll(".mg-mihon-global-btn");

        for (const btn of purchaseButtons) {
          if (!(btn instanceof HTMLButtonElement)) continue;
          btn.disabled = !canConfigure;
        }

        for (const btn of mihonButtons) {
          if (!(btn instanceof HTMLButtonElement)) continue;
          btn.disabled = !canConfigure;
        }
        refreshPurchaseButtons();
        refreshGlobalMihonButtons();
        syncPerVolumeOwnershipControls();
      }

      function syncPerVolumeOwnershipControls() {
        const canConfigure =
          (chapter.available || volume.available) && hasImportableProfileSelected();

        for (const btn of panel.querySelectorAll(".mg-mihon-btn")) {
          if (!(btn instanceof HTMLButtonElement)) continue;
          btn.disabled = !canConfigure;
        }
        for (const btn of panel.querySelectorAll(".mg-purchase-vol-btn")) {
          if (!(btn instanceof HTMLButtonElement)) continue;
          btn.disabled = !canConfigure;
        }
      }

      function readOwnershipFromPanel() {
        return {
          ownerNames: [...selectedPurchaseOwners],
          mihonOwnerName: globalMihonOwner || null,
        };
      }

      function readPerVolumeMihonOverrides() {
        const overrides = {};
        for (const [entryId, ownerName] of perVolumeMihon.entries()) {
          if (ownerName) overrides[entryId] = ownerName;
        }
        return overrides;
      }

      function readPerVolumePurchaseOverrides() {
        const overrides = {};
        for (const [entryId, owners] of perVolumePurchase.entries()) {
          if (owners.size > 0) {
            overrides[entryId] = [...owners];
          }
        }
        return overrides;
      }

      function getPerVolumePurchaseSet(entryId) {
        if (!perVolumePurchase.has(entryId)) {
          perVolumePurchase.set(entryId, new Set());
        }
        return perVolumePurchase.get(entryId);
      }

      function clearPurchaseOwners() {
        selectedPurchaseOwners.clear();
        refreshPurchaseButtons();
      }

      function clearMihonOwners() {
        setGlobalMihonOwner(null);
      }

      function refreshMihonButtonsForEntry(entryId) {
        const ownerName = perVolumeMihon.get(entryId);
        const wrap = panel.querySelector(
          `.mg-vol-mihon-group[data-entry-id="${entryId}"]`,
        );
        if (!wrap) return;
        for (const peer of wrap.querySelectorAll(".mg-mihon-btn")) {
          const owner = peer.dataset.owner || "";
          const active = ownerName === owner;
          peer.classList.toggle("is-active", active);
          applyOwnerButtonColors(peer, active, "mihon", owner);
        }
      }

      function getActiveGlobalMihonOwner() {
        if (!isGlobalMihonModeActive()) {
          return null;
        }
        return globalMihonOwner;
      }

      /** @description Applique le Mihon global aux tomes/chapitres cochés dans le tableau. */
      function applyGlobalMihonToCheckedVolumes(ownerName) {
        for (const checkbox of panel.querySelectorAll(".mg-volume-item:checked")) {
          const entryId = checkbox.getAttribute("data-entry-id");
          if (!entryId) continue;
          if (ownerName) {
            perVolumeMihon.set(entryId, ownerName);
          } else {
            perVolumeMihon.delete(entryId);
          }
          refreshMihonButtonsForEntry(entryId);
        }
      }

      function clearGlobalMihonForOwner(ownerName) {
        for (const [entryId, name] of [...perVolumeMihon.entries()]) {
          if (name !== ownerName) continue;
          perVolumeMihon.delete(entryId);
          refreshMihonButtonsForEntry(entryId);
        }
      }

      /** @description Applique l'achat global aux tomes cochés (colonne Achat du tableau). */
      function applyGlobalPurchaseToCheckedVolumes() {
        if (selectedPurchaseOwners.size === 0) return;
        for (const checkbox of panel.querySelectorAll(".mg-volume-item:checked")) {
          const entryId = checkbox.getAttribute("data-entry-id");
          if (!entryId) continue;
          perVolumePurchase.set(entryId, new Set(selectedPurchaseOwners));
          if (selectedPurchaseOwners.size >= 2) {
            perVolumeSharedPurchase.set(entryId, globalSharedPurchase);
          } else {
            perVolumeSharedPurchase.delete(entryId);
          }
          refreshPurchaseButtonsForEntry(entryId);
        }
      }

      function clearGlobalPurchaseFromCheckedVolumes() {
        for (const checkbox of panel.querySelectorAll(".mg-volume-item:checked")) {
          const entryId = checkbox.getAttribute("data-entry-id");
          if (!entryId) continue;
          perVolumePurchase.delete(entryId);
          refreshPurchaseButtonsForEntry(entryId);
        }
      }

      function refreshPurchaseButtonsForEntry(entryId) {
        const owners = perVolumePurchase.get(entryId);
        const wrap = panel.querySelector(
          `.mg-vol-purchase-group[data-entry-id="${entryId}"]`,
        );
        if (!wrap) return;
        for (const peer of wrap.querySelectorAll(".mg-purchase-vol-btn")) {
          const owner = peer.dataset.owner || "";
          const active = owners?.has(owner) ?? false;
          peer.classList.toggle("is-active", active);
          applyOwnerButtonColors(peer, active, "purchase", owner);
        }
        refreshSharedPurchaseForEntry(entryId);
      }

      /**
       * @description Factory commune pour les groupes de boutons "par tome" (Achat / Mihon).
       * Les deux usages diffèrent par : classe du wrapper, classe des boutons, couleurs actives,
       * test d'état actif et gestion du clic.
       */
      function createVolumeOwnerButtonGroup(entryId, {
        groupClass,
        btnClass,
        colorKind,
        title,
        isOwnerActive,
        onOwnerClick,
      }) {
        const wrap = document.createElement("div");
        wrap.className = groupClass;
        wrap.dataset.entryId = entryId;
        wrap.style.cssText = "display:flex;gap:3px;justify-content:center";
        wrap.title = title;

        for (const ownerName of OWNER_OPTIONS) {
          const short = OWNER_SHORT[ownerName] || ownerName.charAt(0);
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = btnClass;
          btn.dataset.owner = ownerName;
          btn.dataset.entryId = entryId;
          btn.textContent = usesCompactVolumeLayout() ? ownerName : short;
          btn.style.cssText = `${MG_OWNER_BTN_BASE_STYLE};border:1px solid #3d4452`;
          applyOwnerButtonColors(
            btn,
            isOwnerActive(entryId, ownerName),
            colorKind,
            ownerName,
          );
          btn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (btn.disabled) return;
            onOwnerClick(entryId, ownerName);
          });
          wrap.appendChild(btn);
        }
        return wrap;
      }

      function createVolumePurchaseButtons(entryId) {
        const group = createVolumeOwnerButtonGroup(entryId, {
          groupClass: "mg-vol-purchase-group",
          btnClass: "mg-purchase-vol-btn",
          colorKind: "purchase",
          title: "Achat par tome (cumulable avec Mihon)",
          isOwnerActive: (id, ownerName) =>
            getPerVolumePurchaseSet(id).has(ownerName),
          onOwnerClick: (id, ownerName) => {
            const owners = getPerVolumePurchaseSet(id);
            if (owners.has(ownerName)) {
              owners.delete(ownerName);
            } else {
              owners.add(ownerName);
            }
            if (owners.size === 0) {
              perVolumePurchase.delete(id);
              perVolumeSharedPurchase.delete(id);
            } else if (owners.size >= 2 && !perVolumeSharedPurchase.has(id)) {
              perVolumeSharedPurchase.set(id, globalSharedPurchase);
            } else if (owners.size < 2) {
              perVolumeSharedPurchase.delete(id);
            }
            refreshPurchaseButtonsForEntry(id);
          },
        });
        refreshPurchaseButtonsForEntry(entryId);
        return group;
      }

      function createVolumeMihonButtons(entryId) {
        return createVolumeOwnerButtonGroup(entryId, {
          groupClass: "mg-vol-mihon-group",
          btnClass: "mg-mihon-btn",
          colorKind: "mihon",
          title: "Mihon par tome (cumulable avec l'achat physique)",
          isOwnerActive: (id, ownerName) => perVolumeMihon.get(id) === ownerName,
          onOwnerClick: (id, ownerName) => {
            const current = perVolumeMihon.get(id);
            if (current === ownerName) {
              perVolumeMihon.delete(id);
            } else {
              perVolumeMihon.set(id, ownerName);
            }
            refreshMihonButtonsForEntry(id);
          },
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
          if (Number.isFinite(price)) {
            overrides[entryId] = { ...(overrides[entryId] || {}), catalogPrice: price };
          }
        }
        return overrides;
      }

      function updateVolumeRowInPanel(entryId, details, vol, kind) {
        const resolvedKind =
          kind ||
          vol?.contentKind ||
          panel
            .querySelector(`.mg-vol-price[data-entry-id="${entryId}"]`)
            ?.getAttribute("data-kind") ||
          getPrimaryContentKind();
        const dateEl = panel.querySelector(`.mg-vol-date[data-entry-id="${entryId}"]`);
        const priceInput = panel.querySelector(`.mg-vol-price[data-entry-id="${entryId}"]`);
        const releaseDate = details?.releaseDate || vol?.releaseDate || null;
        const catalogPrice =
          details?.catalogPrice ??
          vol?.catalogPrice ??
          (vol?.editionType === "collector" ? null : getDefaultCatalogPrice(resolvedKind));

        if (dateEl) {
          dateEl.textContent = releaseDate ? formatIsoDateFr(releaseDate) : "…";
          dateEl.title = releaseDate ? "Date de parution VF" : "Date VF en cours de récupération";
        }
        if (priceInput instanceof HTMLInputElement && !isPriceInputUserEdited(priceInput)) {
          if (catalogPrice != null) {
            priceInput.value = formatPriceInputValue(catalogPrice);
            priceInput.placeholder = `${formatPriceInputValue(catalogPrice)} €`;
          } else {
            const fallback = getDefaultCatalogPrice(resolvedKind);
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

        await processInBatches(pending, VOLUME_FETCH_CONCURRENCY, VOLUME_FETCH_BATCH_DELAY_MS, async (vol) => {
          if (token !== prefetchToken) return;
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
        }, {
          shouldContinue: () => prefetchToken === token,
        });
      }

      function updateHint() {
        if (isFicheSeuleEnabled()) {
          hint.style.display = "block";
          hint.textContent =
            "Mode fiche seule : seuls le titre, tags, synopsis et compteurs sont exportés — choisissez Tomes/Chapitres dans l'app.";
          return;
        }
        if (!isProfileEnabled("volume")) {
          hint.style.display = "none";
          hint.textContent = "";
          return;
        }
        hint.style.display = "block";
        hint.textContent =
          "Sélectionnez les tomes ci-dessous. Doublons : même numéro et même édition uniquement (Simple + Collector OK).";
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
        const recap = formatKindRecapLine(kind, profile, getMetadataEdition(kind));

        if (!edition || edition.metadataOnly) {
          container.innerHTML = `<p style="margin:0 0 8px;font-weight:600;color:#e8eaed">${escapeHtml(recap)}</p>`;
          return;
        }
        if (!edition.block) {
          container.innerHTML = `<p style="color:#f87171">Bloc édition introuvable.</p>`;
          return;
        }

        const editionVfCount = getVfCountForKind(kind);
        const vfHint =
          editionVfCount != null && editionVfCount > 0
            ? ` · ${editionVfCount} VF parus cochés par défaut`
            : "";
        if (kind === "chapter") {
          container.innerHTML = `<p style="margin:0 0 8px;font-weight:600;color:#e8eaed">${escapeHtml(recap)}</p>`;
        } else {
          container.innerHTML = `<p style="margin:0 0 8px;font-weight:600">Tomes — ${escapeHtml(edition.label || "")} <span style="font-weight:400;color:#9aa0a6;font-size:0.82rem">(date · prix · achat · Mihon · partagé${vfHint})</span></p>`;
        }

        /** @description Ajoute une ligne grille (desktop) ou une carte (mobile) pour un tome/chapitre. */
        function appendVolumeEntry(listRoot, vol, kind, sectionKey, editionVfCount, compactLayout, sectionDefaultChecked) {
          const name =
            kind === "chapter" && vol.volumeNumber != null
              ? `Ch. ${vol.volumeNumber}`
              : formatVolumeListLabel(vol);
          const beyondVf = isVolumeBeyondVfCount(vol, editionVfCount);

          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.className = "mg-volume-item";
          checkbox.dataset.kind = kind;
          checkbox.dataset.sectionId = sectionKey;
          checkbox.dataset.entryId = vol.entryId;
          checkbox.id = `mg-vol-${kind}-${vol.entryId.replace(/[^\w-]/g, "_")}`;
          checkbox.style.cssText = "margin:0;flex:0 0 auto";
          if (shouldSelectVolumeByDefault(vol, editionVfCount, sectionDefaultChecked)) {
            checkbox.checked = true;
          }

          const dateEl = document.createElement("span");
          dateEl.className = "mg-vol-date";
          dateEl.dataset.entryId = vol.entryId;
          dateEl.textContent = vol.releaseDate ? formatIsoDateFr(vol.releaseDate) : "…";
          dateEl.title = "Date de parution VF (Nautiljon)";

          const priceInput = document.createElement("input");
          priceInput.type = "text";
          priceInput.inputMode = "decimal";
          priceInput.className = "mg-vol-price";
          priceInput.dataset.entryId = vol.entryId;
          priceInput.dataset.kind = kind;
          priceInput.dataset.editionType = vol.editionType || "classic";
          priceInput.placeholder = "—";
          priceInput.title = "Prix catalogue en euros";
          priceInput.style.cssText = MG_VOL_TABLE_STYLES.priceInput;
          priceInput.addEventListener("input", () => {
            priceInput.dataset.userEdited = "true";
          });
          priceInput.addEventListener("change", () => {
            priceInput.dataset.userEdited = "true";
          });
          priceInput.addEventListener("click", (event) => event.stopPropagation());

          const purchaseGroup = createVolumePurchaseButtons(vol.entryId);
          const sharedControl = createVolumeSharedControl(vol.entryId);
          const mihonGroup = createVolumeMihonButtons(vol.entryId);

          if (compactLayout) {
            const card = document.createElement("article");
            card.className = "mg-vol-card";
            if (beyondVf) {
              card.title = `Annoncé sur Nautiljon — hors compteur VF (${editionVfCount} paru${editionVfCount > 1 ? "s" : ""})`;
              card.style.opacity = "0.72";
            }

            const titleRow = document.createElement("div");
            titleRow.className = "mg-vol-card-title";
            const titleLine = document.createElement("label");
            titleLine.htmlFor = checkbox.id;
            titleLine.style.cssText = "cursor:pointer;flex:1;min-width:0";
            if (vol.editionType === "collector") {
              titleLine.appendChild(document.createTextNode(`${name} `));
              const collectorSpan = document.createElement("span");
              collectorSpan.style.cssText = MG_VOL_TABLE_STYLES.collector;
              collectorSpan.textContent = "(Collector)";
              titleLine.appendChild(collectorSpan);
            } else {
              titleLine.textContent = name;
            }
            titleRow.append(checkbox, titleLine);
            card.appendChild(titleRow);

            const meta = document.createElement("div");
            meta.className = "mg-vol-card-meta";

            const dateField = document.createElement("div");
            dateField.className = "mg-vol-card-field";
            dateField.innerHTML = '<span class="mg-vol-card-field-label">Date VF</span>';
            dateField.appendChild(dateEl);
            meta.appendChild(dateField);

            const priceField = document.createElement("div");
            priceField.className = "mg-vol-card-field";
            priceField.innerHTML = '<span class="mg-vol-card-field-label">Prix</span>';
            const priceWrap = document.createElement("div");
            priceWrap.style.cssText = MG_VOL_TABLE_STYLES.priceCell + ";justify-content:flex-start";
            priceWrap.append(priceInput);
            const priceSuffix = document.createElement("span");
            priceSuffix.textContent = "€";
            priceSuffix.style.cssText = MG_VOL_TABLE_STYLES.priceSuffix;
            priceWrap.appendChild(priceSuffix);
            priceField.appendChild(priceWrap);
            meta.appendChild(priceField);
            card.appendChild(meta);

            const ownership = document.createElement("div");
            ownership.className = "mg-vol-card-ownership";

            const achatRow = document.createElement("div");
            achatRow.className = "mg-vol-card-ownership-row";
            achatRow.innerHTML = '<span class="mg-vol-card-ownership-label">Achat</span>';
            const achatWrap = document.createElement("div");
            achatWrap.style.cssText = "display:flex;flex-direction:column;gap:6px;flex:1;min-width:0";
            achatWrap.append(purchaseGroup, sharedControl);
            achatRow.appendChild(achatWrap);
            ownership.appendChild(achatRow);

            const mihonRow = document.createElement("div");
            mihonRow.className = "mg-vol-card-ownership-row";
            mihonRow.innerHTML = '<span class="mg-vol-card-ownership-label" style="color:#22d3ee">Mihon</span>';
            mihonRow.appendChild(mihonGroup);
            ownership.appendChild(mihonRow);
            card.appendChild(ownership);

            listRoot.appendChild(card);
          } else {
            const row = document.createElement("div");
            row.className = "mg-vol-grid-row";
            row.style.cssText = MG_VOL_TABLE_STYLES.gridRow;
            if (beyondVf) {
              row.title = `Annoncé sur Nautiljon — hors compteur VF (${editionVfCount} paru${editionVfCount > 1 ? "s" : ""})`;
            }

            const cellName = document.createElement("div");
            cellName.className = "mg-vol-grid-body-cell mg-vol-name-cell";
            cellName.style.cssText = `${MG_VOL_TABLE_STYLES.bodyCell};${MG_VOL_TABLE_STYLES.tdName}`;
            if (beyondVf) cellName.style.opacity = "0.52";
            const nameWrap = document.createElement("div");
            nameWrap.className = "mg-vol-name-wrap";
            nameWrap.style.cssText = MG_VOL_TABLE_STYLES.nameCell;
            const titleLine = document.createElement("label");
            titleLine.htmlFor = checkbox.id;
            titleLine.style.cssText =
              "cursor:pointer;flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left !important";
            if (vol.editionType === "collector") {
              titleLine.appendChild(document.createTextNode(`${name} `));
              const collectorSpan = document.createElement("span");
              collectorSpan.style.cssText = MG_VOL_TABLE_STYLES.collector;
              collectorSpan.textContent = "(Collector)";
              titleLine.appendChild(collectorSpan);
            } else {
              titleLine.textContent = name;
            }
            nameWrap.append(checkbox, titleLine);
            cellName.appendChild(nameWrap);
            row.appendChild(cellName);

            const cellDate = document.createElement("div");
            cellDate.className = "mg-vol-grid-body-cell";
            cellDate.style.cssText = `${MG_VOL_TABLE_STYLES.bodyCell};${MG_VOL_TABLE_STYLES.tdDate}`;
            if (beyondVf) cellDate.style.opacity = "0.52";
            cellDate.appendChild(dateEl);
            row.appendChild(cellDate);

            const cellPrice = document.createElement("div");
            cellPrice.className = "mg-vol-grid-body-cell";
            cellPrice.style.cssText = `${MG_VOL_TABLE_STYLES.bodyCell};${MG_VOL_TABLE_STYLES.tdPrice}`;
            if (beyondVf) cellPrice.style.opacity = "0.52";
            const priceWrap = document.createElement("div");
            priceWrap.style.cssText = MG_VOL_TABLE_STYLES.priceCell;
            priceWrap.appendChild(priceInput);
            const priceSuffix = document.createElement("span");
            priceSuffix.textContent = "€";
            priceSuffix.style.cssText = MG_VOL_TABLE_STYLES.priceSuffix;
            priceWrap.appendChild(priceSuffix);
            cellPrice.appendChild(priceWrap);
            row.appendChild(cellPrice);

            const cellAchat = document.createElement("div");
            cellAchat.className = "mg-vol-grid-body-cell";
            cellAchat.style.cssText = `${MG_VOL_TABLE_STYLES.bodyCell};${MG_VOL_TABLE_STYLES.tdAchat}`;
            if (beyondVf) cellAchat.style.opacity = "0.52";
            const achatStack = document.createElement("div");
            achatStack.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px";
            achatStack.append(purchaseGroup, sharedControl);
            cellAchat.appendChild(achatStack);
            row.appendChild(cellAchat);

            const cellMihon = document.createElement("div");
            cellMihon.className = "mg-vol-grid-body-cell";
            cellMihon.style.cssText = `${MG_VOL_TABLE_STYLES.bodyCell};${MG_VOL_TABLE_STYLES.tdMihon}`;
            if (beyondVf) cellMihon.style.opacity = "0.52";
            cellMihon.appendChild(mihonGroup);
            row.appendChild(cellMihon);

            listRoot.appendChild(row);
          }

          const cached = volumeDetailsCache.get(vol.entryId);
          updateVolumeRowInPanel(vol.entryId, cached, vol);
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
          tableScroll.className = "mg-vol-grid-scroll";
          tableScroll.style.cssText = MG_VOL_TABLE_STYLES.scroll;

          const compactLayout = usesCompactVolumeLayout();
          const listRoot = document.createElement("div");
          listRoot.className = compactLayout ? "mg-vol-card-list" : "mg-vol-grid";
          if (compactLayout) {
            listRoot.style.cssText = "width:100%";
          } else {
            listRoot.style.cssText = MG_VOL_TABLE_STYLES.grid;
            listRoot.setAttribute("role", "grid");
            appendVolumeGridHead(listRoot, unitCol);
          }

          for (const vol of section.volumes) {
            appendVolumeEntry(
              listRoot,
              vol,
              kind,
              sectionKey,
              editionVfCount,
              compactLayout,
              section.defaultChecked,
            );
          }

          tableScroll.appendChild(listRoot);
          tableWrap.appendChild(tableScroll);
          wrap.appendChild(tableWrap);
          syncPickableSectionMaster(sectionKey);
          container.appendChild(wrap);
        }
      }

      function renderAll(options = {}) {
        const refreshMeta = Boolean(options.refreshMeta);
        renderEditionSection();
        if (refreshMeta) {
          renderMetadataSection();
        }
        syncMetaFromSelection({
          forceCounts: refreshMeta,
          forcePrice: refreshMeta,
        });
        updateHint();
        sectionsBlock.innerHTML = "";
        if (isFicheSeuleEnabled()) {
          const ficheNote = document.createElement("p");
          ficheNote.style.cssText =
            "margin:0;color:#9aa0a6;font-size:0.85rem;text-align:center;padding:8px 0";
          ficheNote.textContent =
            "Fiche seule : pas de liste de tomes/chapitres. Préremplissage Mangathèque uniquement.";
          sectionsBlock.appendChild(ficheNote);
        } else {
          if (isProfileEnabled("chapter")) renderProfileSections("chapter");
          if (isProfileEnabled("volume")) renderProfileSections("volume");
        }
        const globalMihon = getActiveGlobalMihonOwner();
        if (globalMihon) {
          applyGlobalMihonToCheckedVolumes(globalMihon);
        }
        if (selectedPurchaseOwners.size > 0) {
          applyGlobalPurchaseToCheckedVolumes();
        }
        updateSectionSelectionCounts();
        renderConflicts();
        updateImportButtonState();
        syncOwnershipBlockState();
        void prefetchVolumeDetailsForPanel();
        syncPerVolumeOwnershipControls();
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
        const noneSelected = !canSubmitImport();
        const sendDisabled = blocked || noneSelected;
        for (const btn of [reviewBtn, directBtn]) {
          btn.disabled = sendDisabled;
          btn.style.opacity = sendDisabled ? "0.5" : "1";
          btn.style.cursor = sendDisabled ? "not-allowed" : "pointer";
        }
        exportBtn.disabled = noneSelected || importInProgress;
        exportBtn.style.opacity = noneSelected || importInProgress ? "0.5" : "1";
        exportBtn.style.cursor = noneSelected || importInProgress ? "not-allowed" : "pointer";
        exportBtn.title = noneSelected
          ? "Cochez « Chapitres », « Tomes » ou « Fiche seule »"
          : isMobile
            ? "Télécharge un fichier JSON — importez-le dans Mangathèque (bouton Importer .json)"
            : "Télécharge le JSON si l'envoi vers Mangathèque échoue";
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
          <p style="margin:0 0 10px;font-size:0.85rem;color:#fcd34d">Même numéro et même édition cochés dans plusieurs sections (Simple et Collector peuvent coexister).</p>`;
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
        const metadataEdition = getMetadataEdition(kind);
        if (!edition) return null;
        if (edition.metadataOnly) {
          return {
            editionId: edition.id,
            isFrenchEdition: edition.isFrench !== false,
            contentKind: kind,
            metadataOnly: true,
            sections: [],
            selectedVolumeEntryIds: new Set(),
            conflictChoices: {},
            metadataEditionBlock: metadataEdition?.block || null,
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
          perVolumeMihon: readPerVolumeMihonOverrides(),
          perVolumePurchase: readPerVolumePurchaseOverrides(),
          perVolumeSharedPurchase: readPerVolumeSharedOverrides(),
          metadataEditionBlock: metadataEdition?.block || edition.block || null,
        };
      }

      profilesBlock.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.classList.contains("mg-fiche-seule-toggle")) {
          if (target.checked) {
            setFicheSeuleEnabled(true);
          }
          renderAll({ refreshMeta: true });
          return;
        }
        if (target.classList.contains("mg-profile-toggle")) {
          clearFicheSeuleIfProfilesSelected();
          renderAll({ refreshMeta: true });
        }
      });

      editionsBlock.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.name === "mg-edition-chapter") {
          chapterEditionId = target.value;
          /* Suivre automatiquement l'édition du contenu pour la source de métadonnées,
             sauf si l'utilisateur a explicitement choisi une source différente. */
          const chapterSourceSelect = panel.querySelector("#mg-meta-chapter-source-edition");
          if (
            !(chapterSourceSelect instanceof HTMLSelectElement) ||
            chapterSourceSelect.value === chapterMetaEditionId
          ) {
            chapterMetaEditionId = target.value;
          }
          renderAll({ refreshMeta: true });
        }
        if (target.name === "mg-edition-volume") {
          volumeEditionId = target.value;
          const volumeSourceSelect = panel.querySelector("#mg-meta-volume-source-edition");
          if (
            !(volumeSourceSelect instanceof HTMLSelectElement) ||
            volumeSourceSelect.value === volumeMetaEditionId
          ) {
            volumeMetaEditionId = target.value;
          }
          renderAll({ refreshMeta: true });
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
        const globalMihon = getActiveGlobalMihonOwner();
        if (globalMihon) {
          applyGlobalMihonToCheckedVolumes(globalMihon);
        }
        if (selectedPurchaseOwners.size > 0) {
          applyGlobalPurchaseToCheckedVolumes();
        }
        updateSectionSelectionCounts();
        renderConflicts();
      });

      cancelBtn.onclick = () => {
        overlay.remove();
        reject(new Error("Import annulé."));
      };

      let importInProgress = false;

      async function collectValidatedSelections(options = {}) {
        if (isFicheSeuleEnabled()) {
          return [];
        }
        const forExport = Boolean(options.forExport);
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
            if (forExport) {
              for (const [key, candidates] of conflicts) {
                if (!selection.conflictChoices[key] && candidates[0]) {
                  selection.conflictChoices[key] = candidates[0].entryId;
                }
              }
            } else if (conflicts.some(([key]) => !selection.conflictChoices[key])) {
              toast("Résolvez les doublons de numéro.", "error");
              renderConflicts();
              return null;
            }
          }
          selections.push(selection);
        }
        if (selections.length === 0) {
          toast("Cochez au moins chapitres, tomes, ou fiche seule.", "error");
          return null;
        }
        return selections;
      }

      /**
       * @description Construit un payload métadonnées seules (sans tomes/chapitres listés).
       * Active tomes + chapitres pour bascule libre dans la modale Mangathèque.
       */
      function buildFicheSeulePayload() {
        const allMeta = readMetadataOverrides(panel);
        const shared = allMeta.shared || {};
        const volumeMeta = allMeta.volume || {};
        const chapterMeta = allMeta.chapter || {};
        const ownership = readOwnershipFromPanel();
        const title = shared.title || extractTitle();
        if (!title) {
          throw new Error("Titre introuvable.");
        }

        const fallbackPublisher =
          resolvePublisherVf(meta) || resolvePublisherVo(meta) || null;
        const pagePrice = parsePriceEur(meta[META_KEYS.PRICE] || "");

        const volumesVfCount =
          volumeMeta.volumesVfCount ?? volume.vfCount ?? null;
        const volumesVoTotal =
          volumeMeta.volumesVoTotal ?? volume.voCount ?? null;
        const chaptersVfCount =
          chapterMeta.volumesVfCount ?? chapter.vfCount ?? null;
        const chaptersVoTotal =
          chapterMeta.volumesVoTotal ?? chapter.voCount ?? null;

        const payload = {
          schemaVersion: 1,
          title,
          demographicType:
            shared.demographicType || meta[META_KEYS.TYPE] || null,
          genres:
            shared.genres?.length > 0
              ? shared.genres
              : extractTaggedListFromDoc(document, META_KEYS.GENRES),
          themes:
            shared.themes?.length > 0
              ? shared.themes
              : extractTaggedListFromDoc(document, META_KEYS.THEMES),
          publisherVf: volumeMeta.publisherVf || fallbackPublisher,
          chapterPublisherVf: chapterMeta.publisherVf || fallbackPublisher,
          volumesVfCount,
          volumesVoTotal,
          chaptersVfCount,
          chaptersVoTotal,
          hasVolumeTracking: true,
          hasChapterTracking: true,
          readingStatus:
            volumeMeta.readingStatus ||
            chapterMeta.readingStatus ||
            volume.readingStatus ||
            chapter.readingStatus ||
            null,
          trackingUnit: "volume",
          defaultPrice:
            volumeMeta.defaultPrice ??
            chapterMeta.defaultPrice ??
            pagePrice ??
            undefined,
          priceFormat: volumeMeta.priceFormat || volume.priceFormat || "broche",
          chapterPriceFormat:
            chapterMeta.priceFormat || chapter.priceFormat || "numerique",
          synopsis: shared.synopsis || extractSynopsis() || null,
          coverUrl: shared.coverUrl || extractCoverUrl() || null,
          sourceUrl: window.location.href,
          volumes: [],
        };

        if (ownership.mihonOwnerName) {
          payload.mihonOwnerName = ownership.mihonOwnerName;
        }
        if (ownership.ownerNames?.length > 0) {
          payload.ownerNames = ownership.ownerNames;
        }

        return payload;
      }

      async function buildPayloadsFromPanel(options = {}) {
        if (isFicheSeuleEnabled()) {
          try {
            const payload = buildFicheSeulePayload();
            return { payloads: [payload], ownership: readOwnershipFromPanel() };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Export fiche seule impossible.";
            toast(message, "error");
            return null;
          }
        }

        const selections = await collectValidatedSelections(options);
        if (!selections) return null;

        const ownership = readOwnershipFromPanel();
        const allMetaOverrides = readMetadataOverrides(panel);
        const payloads = [];

        for (const selection of selections) {
          let payload = await buildPayload(selection, ownership);
          const kindOverrides = resolveMetadataOverridesForKind(
            allMetaOverrides,
            selection.contentKind,
          );
          if (kindOverrides) {
            payload = mergeMetadataIntoPayload(payload, kindOverrides);
          }
          if (
            !payload.volumes?.some(
              (volume) => volume.mihonOwnerName || volume.ownerNames?.length,
            )
          ) {
            if (ownership.mihonOwnerName) {
              payload.mihonOwnerName = ownership.mihonOwnerName;
            }
            if (ownership.ownerNames?.length > 0) {
              payload.ownerNames = ownership.ownerNames;
            }
          }
          payloads.push(payload);
        }

        if (
          payloads.length === 2 &&
          payloads.some((p) => p.trackingUnit === "chapter") &&
          payloads.some((p) => p.trackingUnit === "volume")
        ) {
          const chapterPayload = payloads.find((p) => p.trackingUnit === "chapter");
          const volumePayload = payloads.find((p) => p.trackingUnit === "volume");
          if (chapterPayload && volumePayload) {
            const merged = {
              ...volumePayload,
              title: volumePayload.title.replace(/\s*\(Tomes\)\s*$/, ""),
              hasVolumeTracking: true,
              hasChapterTracking: true,
              chaptersVfCount: chapterPayload.volumesVfCount ?? chapterPayload.chaptersVfCount ?? null,
              chaptersVoTotal: chapterPayload.volumesVoTotal ?? chapterPayload.chaptersVoTotal ?? null,
              chapterPublisherVf: chapterPayload.publisherVf ?? chapterPayload.chapterPublisherVf ?? null,
              chapterPriceFormat: chapterPayload.priceFormat ?? chapterPayload.chapterPriceFormat ?? "numerique",
              trackingUnit: "volume",
              mihonOwnerName:
                chapterPayload.mihonOwnerName || volumePayload.mihonOwnerName || undefined,
              ownerNames:
                volumePayload.ownerNames?.length > 0
                  ? volumePayload.ownerNames
                  : chapterPayload.ownerNames,
            };
            return { payloads: [merged], ownership };
          }
        }

        return { payloads, ownership };
      }

      async function handleSendToApp(mode) {
        if (importInProgress) {
          return;
        }
        importInProgress = true;
        setFooterStatus("");
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
            setFooterStatus(
              "Vérifiez la sélection et les doublons avant envoi.",
              "error",
            );
            toast("Vérifiez la sélection et les doublons avant envoi.", "error");
            return;
          }

          const startRes = await requestJson("/api/import-start", {});
          assertImportOk(startRes, "Mangathèque n'a pas confirmé le début d'import.");

          for (const payload of built.payloads) {
            const body =
              mode === "direct"
                ? { mode: "direct", payload }
                : payload;
            const path =
              mode === "direct" ? "/api/import-work-direct" : "/api/import-work";
            const res = await requestJson(path, body);
            assertImportOk(res, "Mangathèque n'a pas confirmé la réception.");
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
          const message = e instanceof Error ? e.message : "Erreur";
          setFooterStatus(
            `${message} — la fenêtre reste ouverte. Utilisez « Exporter JSON » si besoin.`,
            "error",
          );
          toast(`❌ ${message}`, "error");
          try {
            await requestJson("/api/import-cancel", {});
          } catch {
            /* ignoré */
          }
        } finally {
          importInProgress = false;
          reviewBtn.textContent = previousReviewLabel;
          directBtn.textContent = previousDirectLabel;
          updateImportButtonState();
        }
      }

      exportBtn.onclick = async () => {
        if (importInProgress || exportBtn.disabled) {
          if (exportBtn.disabled) {
            toast("Cochez chapitres, tomes, ou fiche seule.", "error");
          }
          return;
        }
        const previousExportLabel = exportBtn.textContent;
        importInProgress = true;
        exportBtn.disabled = true;
        exportBtn.textContent = "Préparation…";
        setFooterStatus("Récupération des données et export JSON…", "info");
        try {
          const built = await buildPayloadsFromPanel({ forExport: true });
          if (!built) {
            setFooterStatus("Vérifiez la sélection avant l'export JSON.", "error");
            toast("Export impossible : vérifiez la sélection.", "error");
            return;
          }
          exportBtn.textContent = "Téléchargement…";
          const json = JSON.stringify(
            built.payloads.length === 1 ? built.payloads[0] : built.payloads,
            null,
            2,
          );
          const title = built.payloads[0]?.title ?? "serie";
          const platform = getExportPlatform();
          const exportResult = await downloadJsonExport(title, json);
          if (platform.mobile && exportResult.fileSaved) {
            try {
              await copyTextToClipboard(json);
              exportResult.clipboardOk = true;
            } catch {
              /* fichier seul */
            }
          }
          const successMessages = buildExportSuccessMessages(platform, exportResult);
          setFooterStatus(successMessages.footer, exportResult.fileSaved ? "success" : "error");
          toast(successMessages.toast, exportResult.fileSaved ? "success" : "error", 9000);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Export JSON impossible.";
          setFooterStatus(message, "error");
          toast(`❌ ${message}`, "error");
        } finally {
          importInProgress = false;
          exportBtn.textContent = previousExportLabel;
          updateImportButtonState();
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

      renderAll({ refreshMeta: true });
    });
  }
  /** @description Détecte si la page courante est une fiche artbook Nautiljon. */
  function isArtbookPage() {
    return /^\/artbook\//.test(window.location.pathname);
  }

  function isWorkMainPage() {
    const path = window.location.pathname;
    if (!/^\/(mangas|light_novels|artbook)\//.test(path)) {
      return false;
    }
    return !/\/volume-\d+/i.test(path) && !/\/chapitre-\d+/i.test(path);
  }

  function resolveWorkMainPageUrl() {
    const path = window.location.pathname;
    const match = path.match(/^\/((?:mangas|light_novels|artbook)\/[^/]+)/);
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

  /**
   * @description Traite `items` par lots de taille `concurrency`, en parallèle au sein
   * d'un lot, avec une pause `delayMs` entre les lots. Factorise la logique partagée par
   * `prefetchVolumeDetailsForPanel` et `fetchVolumeDetails`.
   * @param {Array} items
   * @param {number} concurrency
   * @param {number} delayMs
   * @param {(item: any, index: number) => Promise<any>} processFn
   * @param {{ shouldContinue?: () => boolean, cooldownMs?: (batchItems: any[]) => number }} [options]
   */
  async function processInBatches(items, concurrency, delayMs, processFn, options = {}) {
    const { shouldContinue, cooldownMs } = options;
    const total = items.length;
    if (total === 0) return;

    const batchCount = Math.ceil(total / concurrency);
    for (let batch = 0; batch < batchCount; batch++) {
      if (shouldContinue && !shouldContinue()) return;
      const start = batch * concurrency;
      const chunk = items.slice(start, start + concurrency);
      await Promise.all(chunk.map((item, i) => processFn(item, start + i)));
      if (batch < batchCount - 1) {
        const wait = cooldownMs ? cooldownMs(chunk) : delayMs;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
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

    let batchIndex = 0;
    await processInBatches(
      needsFetch,
      VOLUME_FETCH_CONCURRENCY,
      VOLUME_FETCH_BATCH_DELAY_MS,
      async (vol) => {
        await fetchOneVolumeDetails(vol);
      },
      {
        cooldownMs: (chunk) => {
          const start = batchIndex * VOLUME_FETCH_CONCURRENCY;
          const end = start + chunk.length;
          batchIndex += 1;
          console.log(`  Lot ${batchIndex}/${batchCount} (tomes ${start + 1}–${end}/${total})`);
          const batchHadError = chunk.some((vol) => vol._fetchFailed);
          if (batchHadError) {
            console.log(`  ⏸ Pause ${VOLUME_FETCH_COOLDOWN_AFTER_ERROR_MS} ms (rate-limit détecté)…`);
            return VOLUME_FETCH_COOLDOWN_AFTER_ERROR_MS;
          }
          return VOLUME_FETCH_BATCH_DELAY_MS;
        },
      },
    );
    // Log du dernier lot (le hook cooldownMs n'est pas appelé après le dernier lot).
    if (batchIndex < batchCount) {
      const start = batchIndex * VOLUME_FETCH_CONCURRENCY;
      const end = Math.min(start + VOLUME_FETCH_CONCURRENCY, total);
      console.log(`  Lot ${batchIndex + 1}/${batchCount} (tomes ${start + 1}–${end}/${total})`);
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

  async function buildPayload(selection, ownership = null) {
    const title = extractTitle();
    if (!title) throw new Error("Titre introuvable.");

    const meta = extractMetadataBlock();
    const contentKind = selection.contentKind || "volume";
    const trackingUnit = contentKind === "chapter" ? "chapter" : "volume";
    const isFrenchEdition = selection.isFrenchEdition !== false;
    const isLn = window.location.pathname.includes("/light_novels/");

    const editionMeta = selection.metadataEditionBlock
      ? parseEditionBlockMetadata(selection.metadataEditionBlock)
      : {};

    const vfMetaRaw = editionMeta.vfRaw || "";
    const nbVf =
      editionMeta.vfCount ??
      (isFrenchEdition ? parseVfVolumeCount(vfMetaRaw) : null);
    const readingStatus =
      editionMeta.readingStatus ||
      (isFrenchEdition ? mapReadingStatusFromVfMeta(vfMetaRaw) : null);
    const voRaw = editionMeta.voRaw || "";
    const nbVo = voRaw.match(/\d+/);

    const defaultPrice =
      editionMeta.price ?? parsePriceEur(meta[META_KEYS.PRICE] || "");

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
          if (override && Number.isFinite(override.catalogPrice)) {
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
      isLn
        ? "Light Novel"
        : editionMeta.meta?.[META_KEYS.TYPE_VOLUME] ||
            meta[META_KEYS.TYPE_VOLUME] ||
            "Broché",
    );
    if (
      trackingUnit === "chapter" &&
      !String(
        editionMeta.meta?.[META_KEYS.TYPE_VOLUME] || meta[META_KEYS.TYPE_VOLUME] || "",
      )
        .toLowerCase()
        .includes("broch")
    ) {
      priceFormat = "numerique";
    }

    const perVolumeMihon = selection.perVolumeMihon || {};
    const perVolumePurchase = selection.perVolumePurchase || {};
    const perVolumeSharedPurchase = selection.perVolumeSharedPurchase || {};
    const globalMihon = ownership?.mihonOwnerName || null;
    const globalPurchase = ownership?.ownerNames || [];

    return {
      schemaVersion: 1,
      title,
      demographicType: meta[META_KEYS.TYPE] || null,
      genres: extractTaggedListFromDoc(document, META_KEYS.GENRES),
      themes: extractTaggedListFromDoc(document, META_KEYS.THEMES),
      publisherVf:
        trackingUnit === "volume"
          ? (editionMeta.publisherVf ||
              resolvePublisherVf(meta) ||
              (isFrenchEdition ? null : resolvePublisherVo(meta) || null))
          : undefined,
      chapterPublisherVf:
        trackingUnit === "chapter"
          ? (editionMeta.publisherVf ||
              resolvePublisherVf(meta) ||
              (isFrenchEdition ? null : resolvePublisherVo(meta) || null))
          : undefined,
      volumesVfCount:
        trackingUnit === "volume"
          ? (nbVf ??
            (volumes.filter((v) => v.volumeNumber != null && !v.volumeLabel).length ||
              null))
          : undefined,
      volumesVoTotal:
        trackingUnit === "volume" && nbVo ? Number(nbVo[0]) : undefined,
      chaptersVfCount:
        trackingUnit === "chapter"
          ? (nbVf ??
            (volumes.filter((v) => v.volumeNumber != null && !v.volumeLabel).length ||
              null))
          : undefined,
      chaptersVoTotal:
        trackingUnit === "chapter" && nbVo ? Number(nbVo[0]) : undefined,
      hasVolumeTracking: trackingUnit === "volume",
      hasChapterTracking: trackingUnit === "chapter",
      readingStatus,
      trackingUnit,
      defaultPrice:
        trackingUnit === "chapter" && defaultPrice == null ? undefined : defaultPrice,
      priceFormat: trackingUnit === "volume" ? priceFormat : undefined,
      chapterPriceFormat: trackingUnit === "chapter" ? priceFormat : undefined,
      synopsis: extractSynopsis(),
      coverUrl: extractCoverUrl() || null,
      sourceUrl: window.location.href,
      volumes: volumes.map((v) => {
        const row = {
          volumeNumber: v.volumeNumber ?? null,
          volumeLabel: v.volumeLabel || undefined,
          coverUrl: v.coverUrl,
          releaseDate: v.releaseDate,
          editionType: v.editionType,
          catalogPrice: v.catalogPrice ?? undefined,
        };
        const perVolMihon = perVolumeMihon[v.entryId];
        const perVolOwners = perVolumePurchase[v.entryId];

        if (perVolMihon) {
          row.mihonOwnerName = perVolMihon;
        } else if (globalMihon) {
          row.mihonOwnerName = globalMihon;
        }

        if (perVolOwners?.length) {
          row.ownerNames = [...perVolOwners];
        } else if (globalPurchase.length > 0) {
          row.ownerNames = [...globalPurchase];
        }

        const resolvedOwners = row.ownerNames || [];
        if (resolvedOwners.length >= 2) {
          const sharedOverride = perVolumeSharedPurchase[v.entryId];
          row.sharedPurchase =
            sharedOverride != null ? Boolean(sharedOverride) : true;
        }

        return row;
      }),
    };
  }

  function assertImportOk(data, fallbackMessage) {
    if (!data || data.ok !== true) {
      throw new Error(
        (data && typeof data.error === "string" && data.error) ||
          fallbackMessage ||
          "Réponse Mangathèque invalide.",
      );
    }
    return data;
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
    return getExportPlatform().mobile;
  }

  /**
   * @description Plateforme d'export (Android, iOS, mobile, bureau).
   */
  function getExportPlatform() {
    const ua = navigator.userAgent;
    const android = /Android/i.test(ua);
    const ios = /iPhone|iPad|iPod/i.test(ua);
    const mobile = android || ios || /Mobile/i.test(ua);
    return {
      android,
      ios,
      mobile,
      desktop: !mobile,
      tablet: (android || ios) && !/Mobile/i.test(ua),
    };
  }

  /**
   * @description Messages de succès export selon plateforme et méthode utilisée.
   */
  function buildExportSuccessMessages(platform, exportResult) {
    const importHint = "Mangathèque → Ajouter → Importer .json";
    if (exportResult.fileSaved) {
      if (exportResult.method === "share") {
        return {
          footer: `Fichier partagé / enregistré. Ouvrez ${importHint}.`,
          toast: `📥 Fichier JSON prêt — ${importHint}`,
        };
      }
      if (platform.mobile) {
        const extra = exportResult.clipboardOk
          ? " Copie presse-papiers disponible en secours."
          : "";
        return {
          footer: `Fichier JSON enregistré (Téléchargements).${extra} ${importHint}`,
          toast: `📥 Fichier téléchargé — ${importHint}`,
        };
      }
      return {
        footer: `Fichier JSON enregistré. ${importHint}. La fenêtre reste ouverte.`,
        toast: `📥 Fichier enregistré — ${importHint}`,
      };
    }
    if (exportResult.clipboardOk) {
      return {
        footer: `Téléchargement fichier impossible — JSON copié dans le presse-papiers. Collez-le dans ${importHint} ou enregistrez-le manuellement en .json.`,
        toast: `📋 Presse-papiers seul — ${importHint}`,
      };
    }
    return {
      footer: `Téléchargement impossible. Vérifiez que Tampermonkey peut télécharger des fichiers (paramètres extension).`,
      toast: "❌ Téléchargement fichier impossible",
    };
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

  /**
   * @description Convertit un Blob en data URL base64 (compatible GM_download mobile).
   */
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }
        reject(new Error("Lecture du fichier export impossible."));
      };
      reader.onerror = () => reject(new Error("Lecture du fichier export impossible."));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * @description Lance GM_download avec délai max (sans succès fantôme).
   */
  function gmDownloadFile(url, fileName, saveAs) {
    return new Promise((resolve, reject) => {
      if (typeof GM_download !== "function") {
        reject(new Error("GM_download indisponible."));
        return;
      }
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      const timer = window.setTimeout(() => {
        finish(reject, new Error("Téléchargement Tampermonkey expiré."));
      }, 15000);

      try {
        GM_download({
          url,
          name: fileName,
          saveAs,
          conflictAction: "uniquify",
          onload: () => finish(resolve, undefined),
          ontimeout: () => finish(reject, new Error("Téléchargement Tampermonkey expiré.")),
          onerror: (error) =>
            finish(
              reject,
              error instanceof Error
                ? error
                : new Error("Téléchargement Tampermonkey impossible."),
            ),
        });
      } catch (error) {
        finish(
          reject,
          error instanceof Error ? error : new Error("GM_download a échoué."),
        );
      }
    });
  }

  /**
   * @description Chaîne GM_download mobile (saveAs: false → dossier Téléchargements).
   */
  async function tryGmDownloadChain(fileName, json, blob, blobUrl, errors) {
    if (typeof GM_download !== "function") {
      return null;
    }

    const attempts = [];

    attempts.push(async () => {
      await gmDownloadFile(blobUrl, fileName, false);
      return "gm-download-blob";
    });

    if (json.length < 600_000) {
      const textDataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
      attempts.push(async () => {
        await gmDownloadFile(textDataUrl, fileName, false);
        return "gm-download-data";
      });
    }

    attempts.push(async () => {
      const base64DataUrl = await blobToDataUrl(blob);
      await gmDownloadFile(base64DataUrl, fileName, false);
      return "gm-download-base64";
    });

    for (const attempt of attempts) {
      try {
        const method = await attempt();
        return { method, fileSaved: true, clipboardOk: false };
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    return null;
  }

  /**
   * @description Partage natif d'un fichier JSON (Android / tablette, secours).
   */
  async function tryShareJsonFile(fileName, json) {
    if (typeof navigator.share !== "function" || typeof File === "undefined") {
      throw new Error("Partage de fichier indisponible.");
    }
    const file = new File([json], fileName, { type: "application/json" });
    const payload = { files: [file], title: fileName };
    if (typeof navigator.canShare === "function" && !navigator.canShare(payload)) {
      throw new Error("Partage de fichier non supporté.");
    }
    await navigator.share(payload);
    return { method: "share", fileSaved: true, clipboardOk: false };
  }

  /**
   * @description Firefox Android — ordre historique v1.15 : ancre blob puis GM_download.
   */
  async function downloadJsonExportMobile(fileName, json, blob, blobUrl) {
    const errors = [];
    const revokeBlob = () => {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {
        /* ignoré */
      }
    };

    try {
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = fileName;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(revokeBlob, 2000);
      return { method: "anchor", fileSaved: true, clipboardOk: false };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    const gmResult = await tryGmDownloadChain(fileName, json, blob, blobUrl, errors);
    if (gmResult) {
      revokeBlob();
      return gmResult;
    }

    try {
      return await tryShareJsonFile(fileName, json);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    revokeBlob();
    try {
      await copyTextToClipboard(json);
      return { method: "clipboard", fileSaved: false, clipboardOk: true };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    throw new Error(
      errors.length > 0
        ? `Téléchargement impossible : ${errors[0]}`
        : "Téléchargement impossible sur ce navigateur.",
    );
  }

  /**
   * @description Télécharge un export JSON — mobile et bureau.
   */
  async function downloadJsonExport(title, json) {
    const fileName = `mangatheque-${safeFileName(title)}.json`;
    const platform = getExportPlatform();
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);

    if (platform.mobile) {
      return downloadJsonExportMobile(fileName, json, blob, blobUrl);
    }

    const errors = [];
    const saveAsAttempts = [true, false];

    const revokeBlob = () => {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {
        /* ignoré */
      }
    };

    const fileSaved = (method) => ({
      method,
      fileSaved: true,
      clipboardOk: false,
    });

    const tryGmDownload = async (url, saveAs) => {
      await gmDownloadFile(url, fileName, saveAs);
      return fileSaved("gm-download");
    };

    if (typeof GM_download === "function") {
      if (json.length < 1_200_000) {
        const textDataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
        for (const saveAs of saveAsAttempts) {
          try {
            const result = await tryGmDownload(textDataUrl, saveAs);
            revokeBlob();
            return result;
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
          }
        }
      }

      for (const saveAs of saveAsAttempts) {
        try {
          const result = await tryGmDownload(blobUrl, saveAs);
          revokeBlob();
          return result;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    }

    try {
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = fileName;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(revokeBlob, 2000);
      return fileSaved("anchor");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    revokeBlob();
    try {
      await copyTextToClipboard(json);
      return { method: "clipboard", fileSaved: false, clipboardOk: true };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    throw new Error(
      errors.length > 0
        ? `Téléchargement impossible : ${errors[0]}`
        : "Téléchargement impossible sur ce navigateur.",
    );
  }

  async function handleImport() {
    try {
      const result = await showImportSelectionModal(buildImportCatalog(), {
        purpose: "app",
      });
      if (!result?.delivered) {
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
        URL acceptée : fiche principale (ex. <code style="background:rgba(0,0,0,.2);padding:2px 6px;border-radius:4px">…/mangas/nom.html</code>, <code style="background:rgba(0,0,0,.2);padding:2px 6px;border-radius:4px">…/artbook/nom.html</code>)<br>
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
    mountActionButton(
      "mangatheque-import-btn",
      "📚 Importer dans Mangathèque",
      16,
      "linear-gradient(135deg,#6366f1,#4f46e5)",
      () => void handleImport(),
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