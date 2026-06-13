// ==UserScript==
// @name         Nautiljon → Mangathèque
// @namespace    https://github.com/Rory-Mercury-91/Mangatheque
// @version      1.5.8
// @description  Envoie les fiches manga/LN Nautiljon (VF) vers l'app Mangathèque — sélection édition/sections
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

  function volumeDisplayLabel(vol) {
    if (vol.volumeLabel) return vol.volumeLabel;
    if (vol.volumeNumber != null) return `Tome ${vol.volumeNumber}`;
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
      console.log(`   Nb volumes VF (meta Nautiljon) : ${payload.volumesVfCount}`);
    }
    if (payload.defaultPrice != null) {
      console.log(`   Prix indicatif : ${payload.defaultPrice} €`);
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

  function listFrenchEditions() {
    const editions = [];
    for (const header of document.querySelectorAll("h2 a.infos_edition")) {
      if (!hasFranceFlag(header)) continue;
      const id = header.getAttribute("onclick")?.match(/swap\('([^']+)'\)/)?.[1];
      if (!id) continue;
      const block = document.getElementById(id);
      if (!block) continue;
      const label = normalizeSpace(header.textContent).replace(/\s*\(\d+.*\)\s*$/, "");
      editions.push({ id, label, block });
    }
    return editions;
  }

  function classifySection(title) {
    const t = normalizeAscii(title);
    if (t.includes("coffret")) return "coffret";
    if (t.includes("fanbook")) return "fanbook";
    if (t.includes("collector")) return "collector";
    if (t.includes("special")) return "special";
    if (t.includes("volume simple") || t.includes("broche")) return "simple";
    return "other";
  }

  function defaultSectionChecked(kind) {
    return kind === "simple";
  }

  function formatVolumeListLabel(vol) {
    if (vol.volumeLabel) return vol.volumeLabel;
    if (vol.volumeNumber != null) return `Vol. ${vol.volumeNumber}`;
    return "Hors-série";
  }

  function parseVolumeNumberFromText(text) {
    const raw = normalizeSpace(text);
    const volMatch = raw.match(/(?:^|\s)vol\.?\s*(\d+)/i);
    if (volMatch) return Number(volMatch[1]);
    const coffretMatch = raw.match(/vol\.?\s*(\d+)\s*[àa]\s*(\d+)/i);
    if (coffretMatch) return Number(coffretMatch[1]);
    return null;
  }

  function parseVolumeNumberFromHref(href) {
    const standard = href.match(/\/volume-(\d+),/i);
    if (standard) return Number(standard[1]);
    const encoded = href.match(/\/volume-vol\.\+(\d+)/i);
    if (encoded) return Number(encoded[1]);
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
      parseVolumeNumberFromText(titleAttr) ||
      parseVolumeNumberFromText(labelText) ||
      null
    );
  }

  function isUnnumberedSectionKind(sectionKind) {
    return sectionKind === "fanbook" || sectionKind === "special";
  }

  function parseVolumeNode(node, sectionTitle, sectionKind) {
    const anchor = node.querySelector("a[href*='/volume-']");
    if (!anchor) return null;

    const href = anchor.getAttribute("href") || "";
    const titleAttr = anchor.getAttribute("title") || "";
    const labelText = normalizeSpace(
      node.querySelector("label")?.textContent || titleAttr || anchor.getAttribute("alt") || "",
    );

    if (sectionKind === "coffret") {
      return null;
    }

    let volumeNumber =
      parseVolumeNumberFromHref(href) ||
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
      if (!volumeLabel || /^vol\.?\s*\d/i.test(volumeLabel)) {
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

    let releaseDate = null;
    const dateMatch = normalizeSpace(node.textContent).match(
      /(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[a-zéûôîàùç]+?\s+\d{4})/i,
    );
    if (dateMatch) releaseDate = toIsoDate(dateMatch[1]);

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
      for (const node of container.querySelectorAll(".unVol")) {
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
      return `Tome ${num}`;
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
      (candidate.volumeNumber != null ? `Vol. ${candidate.volumeNumber}` : "Hors-série");
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

  function showImportSelectionModal(frenchEditions) {
    return new Promise((resolve, reject) => {
      if (frenchEditions.length === 0) {
        reject(new Error("Aucune édition VF trouvée sur cette fiche."));
        return;
      }

      let editionId = frenchEditions[0].id;
      if (frenchEditions.length === 1) {
        editionId = frenchEditions[0].id;
      }

      const overlay = document.createElement("div");
      overlay.id = "mangatheque-import-modal";
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:16px;font:14px/1.45 Segoe UI,sans-serif;color:#e8eaed;";

      const panel = document.createElement("div");
      panel.style.cssText =
        "width:min(560px,100%);max-height:min(88vh,720px);overflow:auto;background:#1a1d26;border:1px solid #2d3340;border-radius:12px;padding:16px;box-shadow:0 16px 48px rgba(0,0,0,.45);";

      panel.innerHTML = `<h2 style="margin:0 0 12px;font-size:1.05rem">Import Mangathèque</h2>`;

      const editionBlock = document.createElement("div");
      editionBlock.style.marginBottom = "14px";
      if (frenchEditions.length > 1) {
        editionBlock.innerHTML = `<p style="margin:0 0 8px;font-weight:600">Édition VF</p>`;
        for (const edition of frenchEditions) {
          const label = document.createElement("label");
          label.style.cssText = "display:flex;gap:8px;margin:6px 0;cursor:pointer;";
          label.innerHTML = `<input type="radio" name="mg-edition" value="${edition.id}" ${edition.id === editionId ? "checked" : ""}/> <span>${edition.label}</span>`;
          editionBlock.appendChild(label);
        }
        panel.appendChild(editionBlock);
      }

      const hint = document.createElement("p");
      hint.style.cssText = "margin:0 0 12px;color:#9aa0a6;font-size:0.85rem";
      hint.textContent =
        "Cochez les tomes section par section. Simple + Collector + Spécial avec le même numéro : choisissez lequel garder.";
      panel.appendChild(hint);

      const sectionsBlock = document.createElement("div");
      sectionsBlock.style.marginBottom = "14px";
      panel.appendChild(sectionsBlock);

      const conflictsBlock = document.createElement("div");
      conflictsBlock.style.marginBottom = "14px";
      panel.appendChild(conflictsBlock);

      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.textContent = "Annuler";
      cancelBtn.style.cssText =
        "padding:8px 14px;border-radius:8px;border:1px solid #2d3340;background:#12141a;color:#e8eaed;cursor:pointer;";
      const okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.textContent = "Importer la sélection";
      okBtn.style.cssText =
        "padding:8px 14px;border-radius:8px;border:0;background:#6366f1;color:#fff;font-weight:600;cursor:pointer;";
      actions.append(cancelBtn, okBtn);
      panel.appendChild(actions);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      const conflictChoices = {};

      function getEditionBlock() {
        const selected =
          frenchEditions.find((e) => e.id === editionId) || frenchEditions[0];
        return selected.block;
      }

      function renderSections() {
        sectionsBlock.innerHTML = `<p style="margin:0 0 8px;font-weight:600">Sections (h3) — sélection par tome</p>`;
        const sections = parseEditionSections(getEditionBlock());
        for (const section of sections) {
          if (!section.importable) {
            const p = document.createElement("p");
            p.style.cssText = "margin:4px 0;color:#9aa0a6;font-size:0.85rem";
            p.textContent = `${section.title} (${section.volumes.length}) — non importé (coffret)`;
            sectionsBlock.appendChild(p);
            continue;
          }

          const wrap = document.createElement("div");
          wrap.style.marginBottom = "12px";

          const header = document.createElement("label");
          header.style.cssText = "display:flex;gap:8px;margin:6px 0;cursor:pointer;align-items:flex-start;";
          header.innerHTML = `<input type="checkbox" class="mg-section mg-section-pickable" data-section-id="${section.id}" ${section.defaultChecked ? "checked" : ""}/> <span><strong>${section.title}</strong> (${section.volumes.length}) — <span class="mg-section-count" data-section-id="${section.id}"></span></span>`;
          wrap.appendChild(header);

          const list = document.createElement("div");
          list.style.cssText =
            "margin:4px 0 0 18px;max-height:min(200px,30vh);overflow:auto;border-left:2px solid #2d3340;padding-left:10px";
          for (const vol of section.volumes) {
            const volLabel = document.createElement("label");
            volLabel.style.cssText =
              "display:flex;gap:8px;margin:4px 0;cursor:pointer;font-size:0.88rem;line-height:1.35";
            const name = formatVolumeListLabel(vol);
            const editionHint =
              vol.editionType === "collector" ? ' <span style="opacity:.75">(Collector)</span>' : "";
            volLabel.innerHTML = `<input type="checkbox" class="mg-volume-item" data-section-id="${section.id}" data-entry-id="${vol.entryId}" ${section.defaultChecked ? "checked" : ""}/> <span>${name}${editionHint}</span>`;
            list.appendChild(volLabel);
          }
          wrap.appendChild(list);
          sectionsBlock.appendChild(wrap);
        }
        updateSectionSelectionCounts();
        renderConflicts();
      }

      function getSelectedVolumeEntryIds() {
        return new Set(
          Array.from(panel.querySelectorAll(".mg-volume-item:checked")).map((el) =>
            el.getAttribute("data-entry-id"),
          ),
        );
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

      function readConflictChoicesFromPanel() {
        panel.querySelectorAll('input[type="radio"][name^="conf-"]:checked').forEach((input) => {
          const name = input.getAttribute("name") || "";
          conflictChoices[name.replace(/^conf-/, "")] = input.value;
        });
      }

      function hasUnresolvedConflicts() {
        const picked = buildPickedVolumesFromSelection(
          parseEditionSections(getEditionBlock()),
          getSelectedVolumeEntryIds(),
        );
        readConflictChoicesFromPanel();
        const conflicts = listVolumeNumberConflicts(picked);
        return conflicts.some(([key]) => !conflictChoices[key]);
      }

      function updateImportButtonState() {
        const blocked = hasUnresolvedConflicts();
        okBtn.disabled = blocked;
        okBtn.style.opacity = blocked ? "0.5" : "1";
        okBtn.style.cursor = blocked ? "not-allowed" : "pointer";
        okBtn.title = blocked
          ? "Résolvez les doublons de numéro avant d'importer."
          : "";
      }

      function renderConflicts() {
        readConflictChoicesFromPanel();
        conflictsBlock.innerHTML = "";
        conflictsBlock.style.cssText = "margin-bottom:14px";

        const sections = parseEditionSections(getEditionBlock());
        const picked = buildPickedVolumesFromSelection(
          sections,
          getSelectedVolumeEntryIds(),
        );
        const conflicts = listVolumeNumberConflicts(picked);
        if (conflicts.length === 0) {
          updateImportButtonState();
          return;
        }

        conflictsBlock.style.cssText =
          "margin-bottom:14px;padding:12px;border-radius:10px;border:1px solid #b45309;background:rgba(180,83,9,.18);";
        conflictsBlock.innerHTML = `
          <p style="margin:0 0 4px;font-weight:600;color:#fbbf24">⚠️ Doublons de numéro</p>
          <p style="margin:0 0 10px;font-size:0.85rem;color:#fcd34d">Même tome coché dans plusieurs sections — indiquez lequel conserver.</p>
        `;

        for (const [key, candidates] of conflicts) {
          const wrap = document.createElement("div");
          wrap.style.marginBottom = "10px";
          const title = formatConflictGroupTitle(candidates);
          wrap.innerHTML = `<p style="margin:0 0 4px;font-weight:600">${title}</p>`;
          for (const candidate of candidates) {
            const label = document.createElement("label");
            label.style.cssText =
              "display:flex;gap:8px;margin:3px 0 3px 12px;cursor:pointer;font-size:0.9rem";
            const checked = conflictChoices[key] === candidate.entryId;
            label.innerHTML = `<input type="radio" name="conf-${key}" value="${candidate.entryId}" ${checked ? "checked" : ""}/> <span>${formatConflictCandidateLabel(candidate)}</span>`;
            label.querySelector("input").addEventListener("change", () => {
              conflictChoices[key] = candidate.entryId;
              updateImportButtonState();
            });
            wrap.appendChild(label);
          }
          conflictsBlock.appendChild(wrap);
        }

        updateImportButtonState();
      }

      editionBlock.addEventListener("change", (event) => {
        const target = event.target;
        if (target?.name === "mg-edition") {
          editionId = target.value;
          renderSections();
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
        if (hasUnresolvedConflicts()) {
          conflictsBlock.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });

      cancelBtn.onclick = () => {
        overlay.remove();
        reject(new Error("Import annulé."));
      };

      okBtn.onclick = () => {
        if (okBtn.disabled) {
          toast("Choisissez quelle édition conserver pour chaque doublon de numéro.", "error");
          conflictsBlock.scrollIntoView({ behavior: "smooth", block: "nearest" });
          return;
        }
        const sections = parseEditionSections(getEditionBlock());
        const selectedVolumeEntryIds = getSelectedVolumeEntryIds();
        readConflictChoicesFromPanel();
        const preview = buildPickedVolumesFromSelection(sections, selectedVolumeEntryIds);
        if (preview.length === 0) {
          toast("Sélectionnez au moins un tome.", "error");
          return;
        }
        const conflicts = listVolumeNumberConflicts(preview);
        if (conflicts.some(([key]) => !conflictChoices[key])) {
          toast("Choisissez quelle édition conserver pour chaque doublon de numéro.", "error");
          renderConflicts();
          conflictsBlock.scrollIntoView({ behavior: "smooth", block: "nearest" });
          return;
        }
        startImportChrono();
        overlay.remove();
        resolve({
          editionId,
          sections,
          selectedVolumeEntryIds,
          conflictChoices: { ...conflictChoices },
        });
      };

      renderSections();
      updateImportButtonState();
    });
  }

  function isWorkMainPage() {
    const path = window.location.pathname;
    if (!/^\/(mangas|light_novels)\//.test(path)) {
      return false;
    }
    return !/\/volume-\d+/i.test(path);
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
    let releaseDate = null;
    let coverUrl = null;
    const catalogPrice = extractPriceFromDoc(doc);

    const infoNodes = doc.querySelectorAll("li, dd, p");
    for (const node of infoNodes) {
      const text = normalizeSpace(node.textContent);
      if (/Date de parution VF/i.test(text)) {
        const match = text.match(
          /(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[a-zéûôîàùç]+?\s+\d{4})/i,
        );
        if (match) {
          releaseDate = toIsoDate(match[1]);
          break;
        }
      }
    }

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
      vol.releaseDate = details.releaseDate || vol.releaseDate;
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
    const vfMetaRaw = meta["Nb volumes VF"] || "";
    const nbVf = parseVfVolumeCount(vfMetaRaw);
    const readingStatus = mapReadingStatusFromVfMeta(vfMetaRaw);
    const nbVo = (meta["Nb volumes VO"] || meta["Nb volumes"] || "").match(/\d+/);
    const isLn = window.location.pathname.includes("/light_novels/");

    let volumes = collectSelectedVolumes(
      selection.sections,
      selection.conflictChoices,
      selection.selectedVolumeEntryIds || new Set(),
    );

    if (volumes.length > 0) await fetchVolumeDetails(volumes);

    const vfMax = nbVf && nbVf > 0 ? nbVf : null;
    if (vfMax) {
      volumes = volumes.filter(
        (v) =>
          v.volumeLabel ||
          (v.volumeNumber != null && v.volumeNumber <= vfMax),
      );
    }

    return {
      schemaVersion: 1,
      title,
      demographicType: meta["Type"] || null,
      genres: splitTags(meta["Genres"]),
      themes: splitTags(meta["Thèmes"]),
      publisherVf: meta["Éditeur VF"] || null,
      volumesVfCount:
        vfMax ??
        (volumes.filter((v) => v.volumeNumber != null && !v.volumeLabel).length || null),
      volumesVoTotal: nbVo ? Number(nbVo[0]) : null,
      readingStatus,
      defaultPrice,
      priceFormat: mapPriceFormat(isLn ? "Light Novel" : meta["Type volume"] || "Broché"),
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

  async function runImportWithSelection() {
    const frenchEditions = listFrenchEditions();
    const selection = await showImportSelectionModal(frenchEditions);
    return buildPayload(selection);
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
      const payload = await extractPayloadWithOverlay();
      const json = JSON.stringify(payload, null, 2);
      const mobile = isMobileBrowser();

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
        downloadJsonExport(payload.title, json);
        toast(
          `📥 Fichier JSON téléchargé pour <strong>${payload.title}</strong>. Importez-le dans Mangathèque.`,
          "success",
        );
        return;
      }

      if (!mobile) {
        downloadJsonExport(payload.title, json);
      }

      const elapsed = stopImportChrono("extraction terminée");
      const stats = logImportRecap(payload, elapsed, "export");

      toast(
        mobile
          ? `${buildExportRecapToast(payload, elapsed, stats)}<br><span style="opacity:.88;font-size:12px">Mangathèque → Ajouter → Importer JSON → Coller.</span>`
          : `${buildExportRecapToast(payload, elapsed, stats)}<br><span style="opacity:.88;font-size:12px">Fichier JSON téléchargé en secours.</span>`,
        "success",
        7000,
      );
    } catch (e) {
      stopImportChrono("échec export");
      toast(`❌ ${e instanceof Error ? e.message : "Erreur"}`, "error");
    }
  }

  async function handleImport() {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:999998;background:rgba(0,0,0,.8);display:grid;place-items:center;color:#fff;font:16px Segoe UI,sans-serif;";
    overlay.textContent = "Extraction Nautiljon…";
    document.body.appendChild(overlay);
    try {
      await requestJson("/api/import-start", {});
      const payload = await runImportWithSelection();
      const result = await requestJson("/api/import-work", payload);
      const elapsed = stopImportChrono("données reçues par Mangathèque");
      const stats = logImportRecap(payload, elapsed, "import");
      toast(
        buildImportRecapToast(payload, elapsed, stats, Boolean(result.queued)),
        "success",
        7000,
      );
    } catch (e) {
      stopImportChrono("échec import");
      toast(`❌ ${e instanceof Error ? e.message : "Erreur"}`, "error");
      try {
        await requestJson("/api/import-cancel", {});
      } catch {
        /* ignoré */
      }
    } finally {
      overlay.remove();
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
