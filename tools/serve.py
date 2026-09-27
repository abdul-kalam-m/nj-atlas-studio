"""Local static server for site/ with HTTP Range support.

PMTiles and Parquet are read with byte-range requests, which python -m http.server does not support.
Usage: python tools/serve.py [--port 8080] [--root site]
"""
import argparse
import re
from functools import partial
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

DEFAULT_ROOT = Path(__file__).resolve().parents[1] / "site"
MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".json": "application/json",
    ".geojson": "application/geo+json",
    ".csv": "text/csv; charset=utf-8",
    ".pmtiles": "application/octet-stream",
    ".parquet": "application/octet-stream",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}
RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, root: Path, quiet: bool = False, **kwargs):
        self.root = root.resolve()
        self.quiet = quiet
        super().__init__(*args, **kwargs)

    def log_message(self, format, *args):
        if not self.quiet:
            super().log_message(format, *args)

    def do_GET(self):
        self._serve(send_body=True)

    def do_HEAD(self):
        self._serve(send_body=False)

    def _resolve(self):
        path = unquote(urlsplit(self.path).path)
        if path.endswith("/"):
            path += "index.html"
        target = (self.root / path.lstrip("/")).resolve()
        if not target.is_relative_to(self.root) or not target.is_file():
            return None
        return target

    def _serve(self, send_body):
        target = self._resolve()
        if target is None:
            self._send_empty(HTTPStatus.NOT_FOUND)
            return
        size = target.stat().st_size
        start, end, status = 0, size - 1, HTTPStatus.OK
        header = self.headers.get("Range")
        if header:
            match = RANGE.match(header.strip())
            if match and (match.group(1) or match.group(2)):
                first, last = match.groups()
                if first:
                    start = int(first)
                    end = min(int(last), size - 1) if last else size - 1
                else:  # suffix range: the last N bytes
                    start, end = max(size - int(last), 0), size - 1
                if start >= size or start > end:
                    self._send_empty(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE, {"Content-Range": f"bytes */{size}"})
                    return
                status = HTTPStatus.PARTIAL_CONTENT
        length = end - start + 1 if size else 0
        self.send_response(status)
        self.send_header("Content-Type", MIME_TYPES.get(target.suffix.lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        if status == HTTPStatus.PARTIAL_CONTENT:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self._common_headers()
        self.end_headers()
        if send_body and length:
            with target.open("rb") as stream:
                stream.seek(start)
                self.wfile.write(stream.read(length))

    def _send_empty(self, status, headers=None):
        self.send_response(status)
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.send_header("Content-Length", "0")
        self._common_headers()
        self.end_headers()

    def _common_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")
        self.send_header("Cache-Control", "no-store")


def make_server(root: Path = DEFAULT_ROOT, port: int = 8080, quiet: bool = False) -> ThreadingHTTPServer:
    return ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, root=Path(root), quiet=quiet))


def main():
    parser = argparse.ArgumentParser(description="Serve site/ locally with Range support")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    args = parser.parse_args()
    server = make_server(args.root, args.port)
    print(f"NJ-Atlas dev server: http://127.0.0.1:{server.server_address[1]}/  (Ctrl+C to stop)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
