import time
import os
import threading
import requests
from bs4 import BeautifulSoup
import tkinter as tk

URL = "https://finviz.com/news.ashx?v=3"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
    )
}

try:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
except NameError:
    BASE_DIR = os.getcwd()

KEYWORDS_FILE = os.path.join(BASE_DIR, "keywords.txt")

seen_urls = set()
all_rows = []   # newest at top


def load_keywords():
    if not os.path.exists(KEYWORDS_FILE):
        return []
    out = []
    with open(KEYWORDS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                out.append(line)
    return out


def fetch_once():
    r = requests.get(URL, headers=HEADERS, timeout=10)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    rows = []
    for cell in soup.select("td.news_link-cell"):
        a = cell.select_one("a.nn-tab-link")
        if not a:
            continue
        title = a.get_text(strip=True)
        href = a.get("href", "")
        if not title or not href:
            continue

        if href.startswith("/"):
            full_url = "https://finviz.com" + href
        else:
            full_url = href

        if full_url in seen_urls:
            continue
        seen_urls.add(full_url)

        tickers = [
            x.get_text(strip=True)
            for x in cell.select("a.fv-label.stock-news-label")
            if x.get_text(strip=True)
        ]

        rows.append(
            {
                "title": title,
                "tickers": tickers,
            }
        )

    return rows


class App:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("finviz-sniffer :: live feed")
        self.root.geometry("900x650")
        self.root.configure(bg="#0a0f0a")
        self.root.attributes("-topmost", True)

        # HEADER
        hdr = tk.Label(
            self.root,
            text="⛩  FINVIZ FEED // watch & scalp  ",
            bg="#0a0f0a",
            fg="#22c55e",
            font=("Menlo", 11, "bold"),
            anchor="w",
            padx=10,
        )
        hdr.pack(fill="x")

        # MATCHED BOX (hacker alert)
        top_lbl = tk.Label(
            self.root,
            text="MATCHED SIGNALS",
            bg="#7f1d1d",
            fg="#fef2f2",
            font=("Menlo", 10, "bold"),
            anchor="w",
            padx=10,
        )
        top_lbl.pack(fill="x")

        self.matched_txt = tk.Text(
            self.root,
            wrap="none",
            height=9,
            font=("Menlo", 11),
            bg="#7f1d1d",
            fg="#fef2f2",
            borderwidth=0,
            padx=10,
            pady=6,
            insertbackground="#fef2f2",
        )
        self.matched_txt.pack(fill="x")

        # SEPARATOR
        tk.Label(
            self.root,
            text="ALL TRAFFIC (finviz order)",
            bg="#0a0f0a",
            fg="#64748b",
            font=("Menlo", 10),
            anchor="w",
            padx=10,
        ).pack(fill="x")

        # ALL NEWS
        self.all_txt = tk.Text(
            self.root,
            wrap="none",
            font=("Menlo", 11),
            bg="#020617",
            fg="#22c55e",
            borderwidth=0,
            padx=10,
            pady=6,
            insertbackground="#22c55e",
        )
        self.all_txt.pack(fill="both", expand=True)

    def render_all(self, rows, keywords):
        self.all_txt.delete("1.0", tk.END)
        kw_str = ", ".join(keywords) if keywords else "(none)"
        self.all_txt.insert(tk.END, f"[watching keywords] {kw_str}\n\n")
        self.all_txt.insert(tk.END, f"{'#':<4} {'TICKERS':<34} HEADLINE\n")
        self.all_txt.insert(tk.END, "-" * 140 + "\n")
        for i, r in enumerate(rows, start=1):
            tick = ", ".join(r["tickers"]) if r["tickers"] else "—"
            self.all_txt.insert(tk.END, f"{i:<4} {tick:<34} {r['title']}\n")

    def render_matched(self, rows, keywords):
        self.matched_txt.delete("1.0", tk.END)
        if not keywords:
            self.matched_txt.insert(tk.END, "no keywords.txt => passively watching feed…\n")
            return

        lower_kw = [k.lower() for k in keywords]
        hits = []
        for r in rows:
            text = (r["title"] + " " + " ".join(r["tickers"])).lower()
            if any(k in text for k in lower_kw):
                hits.append(r)

        if not hits:
            self.matched_txt.insert(tk.END, "…no hits yet…   (★ leave window open) \n")
            return

        for idx, r in enumerate(hits, start=1):
            tick = ", ".join(r["tickers"]) if r["tickers"] else "—"
            self.matched_txt.insert(
                tk.END,
                f"[{idx:02d}] {tick}  ⇒  {r['title']}\n"
            )

    def safe_render(self, rows, keywords):
        self.root.after(0, self.render_all, rows, keywords)
        self.root.after(0, self.render_matched, rows, keywords)

    def start(self):
        self.root.mainloop()


try:
    app = App()
except Exception as e:
    print(f"GUI init failed: {e}", flush=True)
    import sys
    sys.exit(1)


def worker():
    import sys
    try:
        print("Scanner starting...", file=sys.stderr, flush=True)
        keywords = load_keywords()
        print(f"Loaded {len(keywords)} keywords: {keywords}", file=sys.stderr, flush=True)

        # first pull
        initial = fetch_once()
        print(f"Fetched {len(initial)} items", file=sys.stderr, flush=True)
        all_rows.extend(initial)
        app.safe_render(all_rows, keywords)
        print("Initial render complete", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"Worker error: {e}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc(file=sys.stderr)

    while True:
        current_keywords = load_keywords()
        if set(current_keywords) != set(keywords):
            keywords = current_keywords
            app.safe_render(all_rows, keywords)

        new_items = fetch_once()
        if new_items:
            for item in reversed(new_items):
                all_rows.insert(0, item)
            app.safe_render(all_rows, keywords)

        time.sleep(15)


t = threading.Thread(target=worker, daemon=True)
t.start()

import sys
print("GUI initialized. Starting mainloop...", file=sys.stderr, flush=True)
try:
    app.start()
except KeyboardInterrupt:
    print("Shutting down...", file=sys.stderr, flush=True)
except Exception as e:
    print(f"Error: {e}", file=sys.stderr, flush=True)
    import traceback
    traceback.print_exc(file=sys.stderr)
