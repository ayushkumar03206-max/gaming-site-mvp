#!/usr/bin/env python3
"""Local static server for the built site (development and browser tests only).

Python's `python -m http.server` keeps a listen queue of only 5 connections; on Windows a
page that requests many thumbnails at once then gets ERR_CONNECTION_REFUSED for some of
them. This server is the same thing with threads and a larger queue.

Usage:
    python scripts/serve.py [port] [dir]          # defaults: 8765 dist
    python scripts/serve.py 8766 pages            # e.g. serve a folder that contains dist under /gaming-site-mvp/
"""
from __future__ import annotations

import functools
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Server(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    port = int(argv[0]) if argv else 8765
    root = Path(argv[1] if len(argv) > 1 else Path(__file__).resolve().parent.parent / "dist")
    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(root))
    with Server(("127.0.0.1", port), handler) as httpd:
        print(f"Serving {root} at http://localhost:{port}/", flush=True)
        httpd.serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
