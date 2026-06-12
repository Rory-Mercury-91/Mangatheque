// ==UserScript==
// @name         Nautiljon → Mangathèque
// @namespace    https://github.com/Rory-Mercury-91/Mangatheque
// @version      1.4.1
// @description  Envoie les fiches manga/LN Nautiljon (VF) vers l'app Mangathèque
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
    const metaList = document.querySelector("ul.mb10");
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

  function findFrenchEditionBlock() {
    for (const header of document.querySelectorAll("h2 a.infos_edition")) {
      const imgs = header.querySelectorAll("img");
      const isFr = Array.from(imgs).some((img) => {
        const alt = (img.getAttribute("alt") || "").toLowerCase();
        const title = (img.getAttribute("title") || "").toLowerCase();
        return alt.includes("france") || title.includes("france");
      });
      if (!isFr) continue;
      const id = header.getAttribute("onclick")?.match(/swap\('([^']+)'\)/)?.[1];
      if (id && document.getElementById(id)) return document.getElementById(id);
    }

    const edition0 = document.getElementById("edition_0");
    if (edition0?.querySelector(".unVol")) {
      const hasFrFlag = document.querySelector(
        'h2 a.infos_edition img[alt*="France" i], h2 a.infos_edition img[title*="France" i]',
      );
      if (hasFrFlag || !document.querySelector("h2 a.infos_edition")) {
        return edition0;
      }
    }
    return null;
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

  function parseVolumeNumber(anchor) {
    const href = anchor.getAttribute("href") || "";
    const m = href.match(/\/volume-(\d+),/i) || href.match(/volume-(\d+)/i);
    return m ? Number(m[1]) : null;
  }

  function extractVolumes(editionBlock) {
    if (!editionBlock) return [];
    const collected = [];
    for (const h3 of editionBlock.querySelectorAll(":scope > h3")) {
      const section = h3.nextElementSibling;
      if (!section) continue;
      for (const node of section.querySelectorAll(".unVol")) {
        const anchor = node.querySelector("a[href*='/volume-']");
        if (!anchor) continue;
        const volumeNumber = parseVolumeNumber(anchor);
        if (!volumeNumber) continue;

        let coverUrl = null;
        const thumb = node.querySelector("img");
        if (thumb) {
          let src = thumb.getAttribute("src") || "";
          src = src.replace("/mini/", "/").replace("/imagesmin/", "/images/");
          src = src.replace(/\?1(\d{10,})/, "?$1");
          if (src) {
            coverUrl = toAbsoluteUrl(src);
          }
        }

        let releaseDate = null;
        const nodeText = normalizeSpace(node.textContent);
        const dateMatch = nodeText.match(
          /(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[a-zéûôîàùç]+?\s+\d{4})/i,
        );
        if (dateMatch) {
          releaseDate = toIsoDate(dateMatch[1]);
        }

        collected.push({
          volumeNumber,
          pageUrl: toAbsoluteUrl(anchor.getAttribute("href")),
          coverUrl,
          releaseDate,
        });
      }
    }
    const byNum = new Map();
    for (const v of collected) {
      if (!byNum.has(v.volumeNumber)) byNum.set(v.volumeNumber, v);
    }
    return Array.from(byNum.values()).sort((a, b) => a.volumeNumber - b.volumeNumber);
  }

  function nautiljonRequestHeaders() {
    return {
      Referer: window.location.href,
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

  function fetchVolumePage(url, retryCount = 0) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        headers: nautiljonRequestHeaders(),
        onload: (res) => {
          const retryable = res.status === 429 || res.status === 403;
          if (retryable && retryCount < 3) {
            const wait = Math.min(1500 * Math.pow(2, retryCount), 12000);
            setTimeout(() => {
              fetchVolumePage(url, retryCount + 1).then(resolve).catch(reject);
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

    return { releaseDate, coverUrl };
  }

  async function fetchVolumeDetails(volumes) {
    const needsFetch = volumes.filter((v) => !v.releaseDate || !v.coverUrl);
    if (needsFetch.length === 0) {
      console.log("✅ Dates/couvertures déjà présentes sur la fiche principale.");
      return;
    }
    console.log(`🔄 Détails VF pour ${needsFetch.length} tome(s)…`);
    for (let i = 0; i < needsFetch.length; i++) {
      const vol = needsFetch[i];
      try {
        const html = await fetchVolumePage(vol.pageUrl);
        const details = extractVolumeDetailsFromHtml(html);
        vol.releaseDate = details.releaseDate || vol.releaseDate;
        if (details.coverUrl) {
          vol.coverUrl = details.coverUrl;
        }
        console.log(
          `  ${vol.coverUrl ? "✅" : "⚠️"} Tome ${vol.volumeNumber}: date=${vol.releaseDate || "—"}, cover=${vol.coverUrl ? "✓" : "✗"}`,
        );
      } catch (e) {
        console.warn(
          `  ❌ Tome ${vol.volumeNumber}: ${e instanceof Error ? e.message : e} (données partielles conservées)`,
        );
      }
      const delay = Math.min(500 + i * 50, 2000);
      await new Promise((r) => setTimeout(r, delay));
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

  async function buildPayload() {
    const title = extractTitle();
    if (!title) throw new Error("Titre introuvable.");

    const meta = extractMetadataBlock();
    const defaultPrice = parsePriceEur(meta["Prix"] || "");
    const vfMetaRaw = meta["Nb volumes VF"] || "";
    const nbVf = parseVfVolumeCount(vfMetaRaw);
    const readingStatus = mapReadingStatusFromVfMeta(vfMetaRaw);
    const nbVo = (meta["Nb volumes VO"] || meta["Nb volumes"] || "").match(/\d+/);
    const isLn = window.location.pathname.includes("/light_novels/");

    const edition = findFrenchEditionBlock();
    if (!edition) {
      console.warn("Édition VF introuvable — tomes non importés.");
    }
    let volumes = extractVolumes(edition);
    if (volumes.length > 0) await fetchVolumeDetails(volumes);

    const vfMax = nbVf && nbVf > 0 ? nbVf : null;
    if (vfMax) {
      volumes = volumes.filter((v) => v.volumeNumber <= vfMax);
    }

    return {
      schemaVersion: 1,
      title,
      demographicType: meta["Type"] || null,
      genres: splitTags(meta["Genres"]),
      themes: splitTags(meta["Thèmes"]),
      publisherVf: meta["Éditeur VF"] || null,
      volumesVfCount: vfMax ?? (volumes.length || null),
      volumesVoTotal: nbVo ? Number(nbVo[0]) : null,
      readingStatus,
      defaultPrice,
      priceFormat: mapPriceFormat(isLn ? "Light Novel" : meta["Type volume"] || "Broché"),
      synopsis: extractSynopsis(),
      coverUrl: extractCoverUrl() || null,
      sourceUrl: window.location.href,
      volumes: volumes.map((v) => ({
        volumeNumber: v.volumeNumber,
        coverUrl: v.coverUrl,
        releaseDate: v.releaseDate,
      })),
    };
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

  function toast(message, kind) {
    const el = document.createElement("div");
    el.innerHTML = message;
    const bg =
      kind === "success" ? "#059669" : kind === "error" ? "#dc2626" : "#4f46e5";
    el.style.cssText = `position:fixed;top:16px;right:16px;z-index:999999;color:#fff;padding:12px 16px;border-radius:10px;background:${bg};max-width:400px;font:14px Segoe UI,sans-serif;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4500);
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
    overlay.textContent = "Extraction Nautiljon…";
    document.body.appendChild(overlay);
    try {
      return await buildPayload();
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

      toast(
        mobile
          ? `📋 JSON copié pour <strong>${payload.title}</strong>. Mangathèque → Ajouter → Importer JSON → Coller.`
          : `📋 JSON copié pour <strong>${payload.title}</strong> (fichier téléchargé en secours).`,
        "success",
      );
    } catch (e) {
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
      const payload = await buildPayload();
      const result = await requestJson("/api/import-work", payload);
      toast(
        result.queued
          ? `📥 <strong>${payload.title}</strong> envoyé à Mangathèque. Validez dans l'app.`
          : "Import envoyé.",
        "success",
      );
    } catch (e) {
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
        URL acceptée : fiche principale de l'œuvre (ex. <code style="background:rgba(0,0,0,.2);padding:2px 6px;border-radius:4px">…/mangas/nom.html</code>)<br>
        URL actuelle : page d'un tome (<code style="background:rgba(0,0,0,.2);padding:2px 6px;border-radius:4px">…/volume-18,….html</code>)
      </span><br>
      <a href="${mainUrl}" style="display:inline-block;margin-top:10px;padding:8px 14px;border-radius:8px;background:#fff;color:#7c2d12;font-weight:700;text-decoration:none">
        ← Revenir à la page principale de l'œuvre
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
