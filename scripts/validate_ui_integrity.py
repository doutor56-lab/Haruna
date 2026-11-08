#!/usr/bin/env python3
"""Static integrity checks for the Haruna WebView UI. No Android runtime is simulated."""
from pathlib import Path
from html.parser import HTMLParser
import re
import sys

ROOT = Path(__file__).resolve().parents[1] / "app/src/main/assets/haruna"
REQUIRED = {"chatView", "settingsView", "memoryView", "libraryView", "modelList",
            "knowledgeList", "permanentLearningList", "memoryItems", "input", "send"}
WORKSPACES = ("chat", "settings", "memory", "library")

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.styles = []
        self.scripts = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids.append(a["id"])
        if tag == "link" and a.get("rel") == "stylesheet":
            self.styles.append(a.get("href", ""))
        if tag == "script" and a.get("src"):
            self.scripts.append(a["src"])

def main():
    failures = []
    page = Page()
    page.feed((ROOT / "index.html").read_text(encoding="utf-8"))
    for item in sorted(REQUIRED - set(page.ids)):
        failures.append(f"Required element missing: #{item}")
    for item in sorted(set(page.ids)):
        if page.ids.count(item) > 1:
            failures.append(f"Duplicate HTML ID: #{item}")
    for asset in page.styles + page.scripts:
        if not asset or not (ROOT / asset.split("?")[0]).is_file():
            failures.append(f"Referenced asset missing: {asset}")
    for name in WORKSPACES:
        asset = f"{name}-workspace.css"
        if page.styles.count(asset) != 1:
            failures.append(f"Expected one stylesheet reference: {asset}")
        elif page.styles.index(asset) < page.styles.index("consolidated.css"):
            failures.append(f"Workspace CSS must load after consolidated.css: {asset}")
    for asset in page.styles:
        path = ROOT / asset
        if path.is_file() and path.suffix == ".css":
            css = re.sub(r"/\\*.*?\\*/", "", path.read_text(encoding="utf-8"), flags=re.S)
            if css.count("{") != css.count("}"):
                failures.append(f"Unbalanced CSS blocks: {asset}")
    for message in failures:
        print("FAIL:", message)
    if failures:
        return 1
    print(f"PASS: {len(page.ids)} unique IDs, {len(page.styles)} stylesheets, "
          f"{len(page.scripts)} scripts and four workspace styles checked")
    print("NOTE: Android compilation and interactive functionality remain untested")
    return 0

if __name__ == "__main__":
    sys.exit(main())
