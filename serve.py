"""Local dev server for the MARQUIS frontend: like `python -m http.server`,
but tells the browser never to cache, so an edited module (voice.js, say)
is always the one that runs after a reload.

    python serve.py            # http://localhost:6262
    python serve.py 4173       # another port
"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 6262


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"MARQUIS frontend on http://localhost:{PORT} (no caching)")
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), NoCacheHandler).serve_forever()
