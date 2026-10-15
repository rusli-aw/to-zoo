#!/usr/bin/env python3
"""
Development server for To-Zoo.

`python -m http.server` sends no cache headers at all, so browsers fall back to
heuristic caching. With an app split across thirty ES modules that means a
reload can mix newly-edited files with cached ones — and a stale module graph
usually fails at import time, which leaves the page sitting on the loading
screen with nothing in the console to explain why.

This is the same static server with `Cache-Control: no-store` on every response,
which is what a dev server should do. Nothing here is needed to deploy: the
folder is plain static files, and a real host sets its own caching.

    python serve.py            # port 5700
    python serve.py 8080       # or any other port
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # One line per request is useful; the default also logs the date twice.
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5700
    handler = partial(NoCacheHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"To-Zoo running at http://localhost:{port}  (cache disabled)")
    print("Ctrl-C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()


if __name__ == "__main__":
    main()
