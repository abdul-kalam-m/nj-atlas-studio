"""Plain-language and library lint for the viewer (docs/GATES.md G2).

1. String literals in site/js/text.js (outside TEXT.downloads) and site/js/studio/text.js (outside TEXT.formats)
   must not contain GIS jargon.
2. Scripts and stylesheets in site/index.html, site/atlas/index.html, site/js/*.js and site/js/studio/*.js load
   only from cdn.jsdelivr.net with an exact @x.y.z version, including jsDelivr URLs kept in a constant and imported
   later (the buffer worker's JSTS). The basemap style URL is data, not a library.
"""
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
BANNED = ["feature", "features", "attribute", "attributes", "geometry", "geometries", "polygon", "polygons",
          "vector", "raster", "tile", "tiles", "EPSG", "CRS", "projection", "WKB", "WKT", "shapefile", "PMTiles",
          "parquet", "GeoParquet", "GeoJSON", "schema", "query", "SQL", "FIPS", "null", "NaN", "undefined",
          "OBJECTID"]
BANNED_PATTERN = re.compile(r"\b(" + "|".join(re.escape(word) for word in BANNED) + r")\b", re.IGNORECASE)
STRING_LITERAL = re.compile(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"|`((?:[^`\\]|\\.)*)`", re.S)
JS_IMPORT = re.compile(r"""(?:\bfrom\s*|\bimport\s*\(\s*)['"](https?://[^'"]+)['"]""")
JS_CDN_LITERAL = re.compile(r"""['"`](https://cdn\.jsdelivr\.net/[^'"`]+)['"`]""")
HTML_ASSET = re.compile(r"""<(?:script[^>]*\bsrc|link[^>]*\bhref)\s*=\s*["'](https?://[^"']+)["']""", re.I)
PINNED = re.compile(r"@\d+\.\d+\.\d+(/|$)")


def strip_block(source: str, key: str) -> str:
    """Remove `key: { ... }` (with nested braces) from the source."""
    start = source.find(f"{key}:")
    if start == -1:
        return source
    brace = source.find("{", start)
    depth = 0
    for index in range(brace, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[:start] + source[index + 1:]
    return source


def string_literals(source: str) -> list[str]:
    literals = []
    for match in STRING_LITERAL.finditer(source):
        text = next(group for group in match.groups() if group is not None)
        literals.append(re.sub(r"\$\{[^}]*\}", " ", text))  # ignore template placeholders
    return literals


def jargon_problems(text_js: str, name: str = "text.js", exempt: str = "downloads") -> list[str]:
    source = strip_block(re.sub(r"^\s*//.*$", "", text_js, flags=re.M), exempt)
    problems = []
    for literal in string_literals(source):
        for match in BANNED_PATTERN.finditer(literal):
            problems.append(f"{name}: '{match.group(0)}' in \"{literal.strip()}\"")
    return problems


def library_problems(files: dict[str, str]) -> list[str]:
    problems = []
    for name, content in files.items():
        if name.endswith(".html"):
            urls = HTML_ASSET.findall(content)
        else:
            urls = list(dict.fromkeys(JS_IMPORT.findall(content) + JS_CDN_LITERAL.findall(content)))
        for url in urls:
            host = urlsplit(url).hostname
            if host != "cdn.jsdelivr.net":
                problems.append(f"{name}: {url} is not served from cdn.jsdelivr.net")
            elif "@latest" in url or not PINNED.search(url):
                problems.append(f"{name}: {url} must pin an exact @x.y.z version")
    return problems


def site_files(root: Path) -> dict[str, str]:
    site = root / "site"
    paths = [site / "index.html", site / "atlas" / "index.html", *sorted((site / "js").glob("*.js")),
             *sorted((site / "js" / "studio").glob("*.js"))]
    return {path.relative_to(root).as_posix(): path.read_text(encoding="utf-8") for path in paths if path.exists()}


def main() -> int:
    text_path = ROOT / "site" / "js" / "text.js"
    if not text_path.exists():
        print("FAIL site/js/text.js is missing")
        return 1
    problems = jargon_problems(text_path.read_text(encoding="utf-8")) + library_problems(site_files(ROOT))
    studio_text = ROOT / "site" / "js" / "studio" / "text.js"
    if studio_text.exists():
        problems += jargon_problems(studio_text.read_text(encoding="utf-8"), "studio/text.js", "formats")
    for problem in problems:
        print(f"FAIL {problem}")
    print("LINT: PASS" if not problems else f"LINT: FAIL ({len(problems)} problem(s))")
    return 0 if not problems else 1


if __name__ == "__main__":
    sys.exit(main())
