#!/usr/bin/env python3
"""Serve the actual Haruna WebView assets for browser-based UI review.

Usage: python3 scripts/preview-ui.py
In GitHub Codespaces, open the forwarded port 4173 in a browser.
Native Android bridges are intentionally not mocked.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "app/src/main/assets/haruna"
PORT = 4173

if __name__ == "__main__":
    if not (ROOT / "index.html").is_file():
        raise SystemExit(f"Haruna assets not found: {ROOT}")
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("0.0.0.0", PORT), handler) as server:
        print(f"Haruna UI preview at http://localhost:{PORT}/")
        print("Only WebView UI is served; Android-native features require the APK.")
        server.serve_forever()
