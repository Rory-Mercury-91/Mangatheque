// ==UserScript==
// @name         Nautiljon → Mangathèque
// @namespace    https://github.com/Rory-Mercury-91/Mangatheque
// @version      1.0.0
// @description  Envoie les fiches manga/LN Nautiljon (VF) vers l'app Mangathèque
// @author       Mangathèque
// @match        https://www.nautiljon.com/mangas/*
// @match        https://www.nautiljon.com/light_novels/*
// @grant        GM_xmlhttpRequest
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
    const raw = normalizeSpace(value).toLowerCase();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
      return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
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

  function findEditionBlock() {
    for (const header of document.querySelectorAll("h2 a.infos_edition")) {
      const imgs = header.querySelectorAll("img");
      const isFr = Array.from(imgs).some((img) => {
        const alt = (img.getAttribute("alt") || "").toLowerCase();
        return alt.includes("france");
      });
      if (!isFr) continue;
      const id = header.getAttribute("onclick")?.match(/swap\('([^']+)'\)/)?.[1];
      if (id && document.getElementById(id)) return document.getElementById(id);
    }
    return document.getElementById("edition_0");
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
        collected.push({
          volumeNumber,
          pageUrl: toAbsoluteUrl(anchor.getAttribute("href")),
          coverUrl: null,
          releaseDate: null,
        });
      }
    }
    const byNum = new Map();
    for (const v of collected) {
      if (!byNum.has(v.volumeNumber)) byNum.set(v.volumeNumber, v);
    }
    return Array.from(byNum.values()).sort((a, b) => a.volumeNumber - b.volumeNumber);
  }

  function fetchVolumePage(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) resolve(res.responseText);
          else reject(new Error(`HTTP ${res.status}`));
        },
        onerror: () => reject(new Error("Réseau")),
      });
    });
  }

  function enrichVolumeFromHtml(html, vol) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const item of doc.querySelectorAll("li")) {
      const text = normalizeSpace(item.textContent);
      if (/Date de parution VF/i.test(text)) {
        const m = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
        if (m) vol.releaseDate = toIsoDate(m[1]);
      }
    }
    const link =
      doc.querySelector('a[id*="couverture"][href*="/images/"]') ||
      doc.querySelector('a[href*="/manga_volumes/"][href*="/images/"]');
    if (link) {
      vol.coverUrl = toAbsoluteUrl(link.getAttribute("href"));
    }
  }

  async function fetchVolumeDetails(volumes) {
    await Promise.all(
      volumes.map(async (vol) => {
        try {
          const html = await fetchVolumePage(vol.pageUrl);
          enrichVolumeFromHtml(html, vol);
        } catch (e) {
          console.warn("Tome", vol.volumeNumber, e);
        }
      }),
    );
  }

  function mapPriceFormat(typeVolume) {
    const lower = String(typeVolume || "").toLowerCase();
    if (lower.includes("kindle") || lower.includes("numérique")) return "numerique";
    return "broche";
  }

  async function buildPayload() {
    const title = extractTitle();
    if (!title) throw new Error("Titre introuvable.");

    const meta = extractMetadataBlock();
    const defaultPrice = parsePriceEur(meta["Prix"] || "");
    const nbVf = (meta["Nb volumes VF"] || "").match(/\d+/);
    const nbVo = (meta["Nb volumes VO"] || meta["Nb volumes"] || "").match(/\d+/);
    const isLn = window.location.pathname.includes("/light_novels/");

    const edition = findEditionBlock();
    const volumes = extractVolumes(edition);
    if (volumes.length > 0) await fetchVolumeDetails(volumes);

    return {
      schemaVersion: 1,
      title,
      demographicType: meta["Type"] || null,
      genres: splitTags(meta["Genres"]),
      themes: splitTags(meta["Thèmes"]),
      publisherVf: meta["Éditeur VF"] || null,
      volumesVfCount: nbVf ? Number(nbVf[0]) : volumes.length || null,
      volumesVoTotal: nbVo ? Number(nbVo[0]) : null,
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

  function mountButton() {
    if (document.getElementById("mangatheque-import-btn")) return;
    const btn = document.createElement("button");
    btn.id = "mangatheque-import-btn";
    btn.type = "button";
    btn.textContent = "📚 Importer dans Mangathèque";
    btn.style.cssText =
      "position:fixed;left:16px;bottom:16px;z-index:999997;border:0;padding:12px 16px;border-radius:10px;color:#fff;font-weight:600;cursor:pointer;background:linear-gradient(135deg,#6366f1,#4f46e5);box-shadow:0 8px 24px rgba(0,0,0,.35);";
    btn.onclick = () => void handleImport();
    document.body.appendChild(btn);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountButton);
  } else {
    mountButton();
  }
})();
