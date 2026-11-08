#!/usr/bin/env python3
"""Create a static GitHub Pages UI preview from Android web assets. No native runtimes."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "app/src/main/assets/haruna"
OUTPUT = ROOT / "_site"
if OUTPUT.exists():
    shutil.rmtree(OUTPUT)
shutil.copytree(SOURCE, OUTPUT)
html_path = OUTPUT / "index.html"
html = html_path.read_text(encoding="utf-8")
anchor = '<script src="theme.js"></script>'
if html.count(anchor) != 1:
    raise SystemExit("Haruna theme bootstrap anchor not found")
html = html.replace(anchor, '<link rel="stylesheet" href="preview.css"><script src="preview-bridge.js"></script>' + anchor)
html_path.write_text(html, encoding="utf-8")
for filename in ("preview-bridge.js", "preview.css"):
    shutil.copy2(ROOT / "web-preview" / filename, OUTPUT / filename)
for filename in ("index.html", "app.js", "image-chat.js", "image-models.js", "image-controls.js", "preview-bridge.js"):
    if not (OUTPUT / filename).is_file():
        raise SystemExit(f"Missing preview file: {filename}")
(OUTPUT / ".nojekyll").write_text("", encoding="utf-8")
print("Haruna web preview prepared in _site/ (no native engines).")
