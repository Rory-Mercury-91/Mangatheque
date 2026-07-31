#!/usr/bin/env python3
"""
Pont Nautiljon pour Mangathèque — à lancer sur une VM (ex. Oracle Cloud).

L'app appelle ce service ; la VM télécharge Nautiljon depuis son IP
(utile si l'IP domicile est marquée « BOT » / 403).

Démarrage :
  export NAUTILJON_BRIDGE_TOKEN='un-secret-long'
  python3 server.py
  # écoute 0.0.0.0:8787

Oracle : ouvrir le port 8787 (Ingress Rules) vers votre IP ou 0.0.0.0/0.
Dans Mangathèque → Contrôle : URL http://IP_PUBLIQUE:8787 + le même token.

API :
  GET /health
  GET /v1/fetch?url=https://www.nautiljon.com/...
  Header : Authorization: Bearer <token>
"""

from __future__ import annotations

import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST = os.environ.get("NAUTILJON_BRIDGE_HOST", "0.0.0.0")
PORT = int(os.environ.get("NAUTILJON_BRIDGE_PORT", "8787"))
TOKEN = os.environ.get("NAUTILJON_BRIDGE_TOKEN", "").strip()

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)

NAUTILJON_HOST_RE = re.compile(
    r"^(?:www\.)?nautiljon\.com$",
    re.IGNORECASE,
)


def is_allowed_nautiljon_url(raw: str) -> bool:
    try:
        parsed = urlparse(raw.strip())
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    if not parsed.netloc:
        return False
    host = parsed.netloc.split("@")[-1].split(":")[0]
    return bool(NAUTILJON_HOST_RE.match(host))


def fetch_url(url: str) -> tuple[int, str, str]:
    """Télécharge une URL Nautiljon. Retourne (status, final_url, body_text)."""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
            "Referer": "https://www.nautiljon.com/",
        },
        method="GET",
    )
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=45, context=ctx) as resp:
            raw = resp.read()
            charset = resp.headers.get_content_charset() or "utf-8"
            body = raw.decode(charset, errors="replace")
            return resp.getcode() or 200, resp.geturl() or url, body
    except urllib.error.HTTPError as err:
        raw = err.read() if err.fp else b""
        charset = "utf-8"
        if err.headers:
            charset = err.headers.get_content_charset() or "utf-8"
        body = raw.decode(charset, errors="replace")
        return err.code, url, body


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, status: int, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send(status, data, "application/json; charset=utf-8")

    def _authorized(self) -> bool:
        if not TOKEN:
            return False
        auth = self.headers.get("Authorization", "")
        if auth == f"Bearer {TOKEN}":
            return True
        # Secours : header dédié (certains reverse-proxy mangent Authorization).
        return self.headers.get("X-Mangatheque-Bridge-Token", "") == TOKEN

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/health":
            self._send_json(
                200,
                {
                    "ok": True,
                    "service": "mangatheque-nautiljon-bridge",
                    "tokenConfigured": bool(TOKEN),
                },
            )
            return

        if path != "/v1/fetch":
            self._send_json(404, {"error": "Route inconnue. Utilisez /health ou /v1/fetch."})
            return

        if not TOKEN:
            self._send_json(
                503,
                {
                    "error": "NAUTILJON_BRIDGE_TOKEN non défini sur le serveur.",
                },
            )
            return

        if not self._authorized():
            self._send_json(401, {"error": "Token invalide ou manquant."})
            return

        qs = parse_qs(parsed.query)
        url = (qs.get("url") or [""])[0].strip()
        if not url:
            self._send_json(400, {"error": "Paramètre url manquant."})
            return
        if not is_allowed_nautiljon_url(url):
            self._send_json(
                400,
                {"error": "URL refusée (domaine nautiljon.com uniquement)."},
            )
            return

        try:
            status, final_url, html = fetch_url(url)
        except Exception as exc:  # noqa: BLE001
            self._send_json(502, {"error": f"Échec téléchargement : {exc}"})
            return

        # Corps HTML brut pour l'app (plus simple côté Rust).
        meta = {
            "status": status,
            "finalUrl": final_url,
            "bytes": len(html.encode("utf-8", errors="replace")),
        }
        body = html.encode("utf-8", errors="replace")
        self.send_response(200 if status < 500 else 502)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Bridge-Status", str(status))
        self.send_header("X-Bridge-Final-Url", final_url)
        self.send_header("X-Bridge-Meta", json.dumps(meta, ensure_ascii=False))
        self.end_headers()
        self.wfile.write(body)


def main() -> int:
    if not TOKEN:
        print(
            "ATTENTION : définissez NAUTILJON_BRIDGE_TOKEN avant de servir du trafic.",
            file=sys.stderr,
        )
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Pont Nautiljon écoute sur http://{HOST}:{PORT}", flush=True)
    print("Routes : GET /health — GET /v1/fetch?url=…", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
