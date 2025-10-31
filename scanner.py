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


def fetch_volume(ticker):
    """Fetch volume for a given ticker from finviz quote page"""
    try:
        # Add delay to avoid rate limiting
        time.sleep(0.5)
        
        # Clean ticker symbol - remove any percentage signs or extra characters
        clean_ticker = ticker.split('+')[0].split('-')[0].strip()
        
        url = f"https://finviz.com/quote.ashx?t={clean_ticker}&ty=c&p=d&b=1"
        r = requests.get(url, headers=HEADERS, timeout=10)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        
        # Find the volume in the fundamentals table
        # Look for the cell that contains exactly "Volume" (not "Rel Volume" or "Avg Volume")
        for td in soup.find_all("td", class_="snapshot-td2"):
            text = td.get_text(strip=True)
            if text == "Volume":  # Exact match only
                # Get the next td which contains the volume value
                volume_td = td.find_next_sibling("td")
                if volume_td:
                    volume = volume_td.get_text(strip=True)
                    return volume
        return "N/A"
    except Exception as e:
        print(f"Error fetching volume for {ticker}: {e}", flush=True)
        return "N/A"


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
                "volumes": {},  # Empty dict, will be populated on demand
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
            if r["tickers"]:
                # Check if we need to fetch any volumes
                has_all_volumes = all(t in r["volumes"] for t in r["tickers"])
                
                if has_all_volumes:
                    # All volumes already fetched, just display them
                    tick_vol_list = []
                    for t in r["tickers"]:
                        tick_vol_list.append(f"{t}({r['volumes'][t]})")
                    tick_vol = ", ".join(tick_vol_list)
                    self.matched_txt.insert(
                        tk.END,
                        f"[{idx:02d}] {tick_vol}  ⇒  {r['title']}\n"
                    )
                else:
                    # First, display with "loading..." for missing volumes
                    tick_list = []
                    for t in r["tickers"]:
                        if t in r["volumes"]:
                            tick_list.append(f"{t}({r['volumes'][t]})")
                        else:
                            tick_list.append(f"{t}(…)")
                    tick_display = ", ".join(tick_list)
                    self.matched_txt.insert(
                        tk.END,
                        f"[{idx:02d}] {tick_display}  ⇒  {r['title']}\n"
                    )
                    self.matched_txt.update()  # Force update display
                    
                    # Now fetch missing volumes one by one and update
                    for t in r["tickers"]:
                        if t not in r["volumes"]:
                            r["volumes"][t] = fetch_volume(t)
                            
                            # Update the line with the new volume
                            tick_vol_list = []
                            for ticker in r["tickers"]:
                                if ticker in r["volumes"]:
                                    tick_vol_list.append(f"{ticker}({r['volumes'][ticker]})")
                                else:
                                    tick_vol_list.append(f"{ticker}(…)")
                            tick_vol = ", ".join(tick_vol_list)
                            
                            # Replace the line
                            content = self.matched_txt.get("1.0", tk.END)
                            lines = content.split("\n")
                            for i, line in enumerate(lines):
                                if line.startswith(f"[{idx:02d}]"):
                                    # Update this line
                                    self.matched_txt.delete(f"{i+1}.0", f"{i+1}.end")
                                    self.matched_txt.insert(f"{i+1}.0", f"[{idx:02d}] {tick_vol}  ⇒  {r['title']}")
                                    self.matched_txt.update()  # Force update display
                                    break
            else:
                tick_vol = "—"
                self.matched_txt.insert(
                    tk.END,
                    f"[{idx:02d}] {tick_vol}  ⇒  {r['title']}\n"
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
