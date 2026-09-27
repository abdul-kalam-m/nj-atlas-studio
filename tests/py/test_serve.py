import http.client
import threading

import pytest

from tools.serve import make_server

BODY = bytes(range(100))


@pytest.fixture
def server(tmp_path):
    (tmp_path / "data.bin").write_bytes(BODY)
    (tmp_path / "index.html").write_text("<p>hi</p>", encoding="utf-8")
    srv = make_server(tmp_path, port=0, quiet=True)
    thread = threading.Thread(target=srv.serve_forever, daemon=True)
    thread.start()
    yield srv.server_address[1]
    srv.shutdown()
    srv.server_close()


def request(port, method, path, headers=None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    conn.request(method, path, headers=headers or {})
    response = conn.getresponse()
    body = response.read()
    conn.close()
    return response, body


def test_range_start_end(server):
    response, body = request(server, "GET", "/data.bin", {"Range": "bytes=0-9"})
    assert response.status == 206
    assert body == BODY[:10]
    assert response.getheader("Content-Range") == "bytes 0-9/100"
    assert response.getheader("Accept-Ranges") == "bytes"


def test_range_open_end(server):
    response, body = request(server, "GET", "/data.bin", {"Range": "bytes=90-"})
    assert response.status == 206
    assert body == BODY[90:]


def test_range_suffix(server):
    response, body = request(server, "GET", "/data.bin", {"Range": "bytes=-5"})
    assert response.status == 206
    assert body == BODY[-5:]


def test_range_past_end_is_416(server):
    response, _ = request(server, "GET", "/data.bin", {"Range": "bytes=200-"})
    assert response.status == 416
    assert response.getheader("Content-Range") == "bytes */100"


def test_head_reports_length(server):
    response, body = request(server, "HEAD", "/data.bin")
    assert response.status == 200
    assert response.getheader("Content-Length") == "100"
    assert body == b""


def test_full_get_and_headers(server):
    response, body = request(server, "GET", "/data.bin")
    assert response.status == 200 and body == BODY
    assert response.getheader("Access-Control-Allow-Origin") == "*"
    assert response.getheader("Cache-Control") == "no-store"


def test_index_and_query_string(server):
    response, body = request(server, "GET", "/?selftest")
    assert response.status == 200 and b"hi" in body
    assert response.getheader("Content-Type").startswith("text/html")


def test_path_escape_is_404(server):
    response, _ = request(server, "GET", "/../x")
    assert response.status == 404
    response, _ = request(server, "GET", "/%2e%2e/%2e%2e/Windows/win.ini")
    assert response.status == 404
