"""Serve the dashboard on http://localhost:8765/app/ and open it in your browser.

Folder sync (the File System Access API) only works on http://localhost, not on
pages opened by double-clicking. This server listens on 127.0.0.1 only, so
nothing is reachable from other machines. Standard library only.

    python serve.py              # port 8765
    python serve.py --port 9000
    python serve.py --no-open    # do not open a browser
"""

import argparse
import functools
import http.server
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Always load the latest files after you pull an update.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the job search dashboard locally.")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-open", action="store_true", help="do not open a browser window")
    args = parser.parse_args()

    handler = functools.partial(Handler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        url = f"http://localhost:{args.port}/app/"
        print(f"Dashboard running at {url}  (press Ctrl+C to stop)")
        if not args.no_open:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
