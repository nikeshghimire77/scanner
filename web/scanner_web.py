import time
import os
import threading
import requests
import json
from bs4 import BeautifulSoup
from flask import Flask, jsonify, send_from_directory

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

# Keywords file is in the parent directory (project root)
KEYWORDS_FILE = os.path.join(os.path.dirname(BASE_DIR), "keywords.txt")
# Config file is in the web directory
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")

# Load configuration
def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    # Default config if file doesn't exist
    return {
        "refresh": {
            "auto_refresh_interval_seconds": 60,
            "hover_refresh_delay_seconds": 1,
            "feed_poll_interval_seconds": 15,
            "auto_refresh_check_interval_seconds": 10
        },
        "api": {
            "rate_limit_delay_seconds": 0.5
        }
    }

config = load_config()

# Helper functions to build URLs based on Elite config
def get_news_url():
    """Get the news feed URL (Elite or free)"""
    elite = config.get("finviz_elite", {})
    if elite.get("enabled", False):
        auth = elite.get("auth_token", "")
        return f"{elite.get('news_url', 'https://finviz.com/news.ashx?v=3')}&auth={auth}"
    return "https://finviz.com/news.ashx?v=3"

def get_quote_url(ticker):
    """Get the quote page URL for a ticker (Elite or free)"""
    elite = config.get("finviz_elite", {})
    if elite.get("enabled", False):
        auth = elite.get("auth_token", "")
        return f"{elite.get('quote_url', 'https://finviz.com/quote.ashx')}?t={ticker}&ty=c&p=d&b=1&auth={auth}"
    return f"https://finviz.com/quote.ashx?t={ticker}&ty=c&p=d&b=1"

def get_export_url(ticker):
    """Get the export data URL for a ticker (Elite only)"""
    elite = config.get("finviz_elite", {})
    if elite.get("enabled", False):
        auth = elite.get("auth_token", "")
        return f"{elite.get('export_url', 'https://elite.finviz.com/quote_export.ashx')}?t={ticker}&p=d&auth={auth}"
    return None

seen_urls = set()
all_rows = []   # newest at top
runtime_keywords = []  # Keywords added via UI (not from file)

app = Flask(__name__, static_folder='static')


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
    """Fetch volume and other metrics for a given ticker from finviz quote page"""
    try:
        # Add delay to avoid rate limiting (from config)
        rate_limit_delay = config.get("api", {}).get("rate_limit_delay_seconds", 0.5)
        time.sleep(rate_limit_delay)
        
        # Clean ticker symbol - remove any percentage signs or extra characters
        clean_ticker = ticker.split('+')[0].split('-')[0].strip()
        
        # Use Elite URL if enabled, otherwise use free URL
        url = get_quote_url(clean_ticker)
        r = requests.get(url, headers=HEADERS, timeout=10)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        
        # Find the metrics in the fundamentals table
        metrics = {
            "volume": "N/A",
            "rel_volume": "N/A",
            "shs_float": "N/A",
            "change": "N/A"
        }
        
        # Look for specific metrics
        for td in soup.find_all("td", class_="snapshot-td2"):
            text = td.get_text(strip=True)
            value_td = td.find_next_sibling("td")
            
            if value_td:
                value = value_td.get_text(strip=True)
                
                if text == "Volume":
                    metrics["volume"] = value
                elif text == "Rel Volume":
                    metrics["rel_volume"] = value
                elif text == "Shs Float":
                    metrics["shs_float"] = value
                elif text == "Change":
                    metrics["change"] = value
        
        return metrics
    except Exception as e:
        print(f"Error fetching volume for {ticker}: {e}", flush=True)
        return {
            "volume": "N/A",
            "rel_volume": "N/A",
            "shs_float": "N/A",
            "change": "N/A"
        }


def fetch_once():
    news_url = get_news_url()
    r = requests.get(news_url, headers=HEADERS, timeout=10)
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

        # Extract timestamp (e.g., "6 min", "12 min")
        timestamp = ""
        date_td = cell.find_previous_sibling("td", class_="news_date-cell")
        if date_td:
            timestamp = date_td.get_text(strip=True)

        rows.append(
            {
                "title": title,
                "tickers": tickers,
                "timestamp": timestamp,
                "volumes": {},  # Empty dict, will be populated on demand with full metrics
            }
        )

    return rows


# Flask routes
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.route('/api/config')
def get_config():
    """Return configuration settings to frontend"""
    # Don't send auth token to frontend for security
    safe_config = config.copy()
    if "finviz_elite" in safe_config:
        elite_config = safe_config["finviz_elite"].copy()
        if "auth_token" in elite_config:
            # Mask the token but show enabled status
            elite_config["auth_token_set"] = True
            elite_config["auth_token"] = "***masked***"
        safe_config["finviz_elite"] = elite_config
    return jsonify(safe_config)


@app.route('/api/feed')
def get_feed():
    file_keywords = load_keywords()
    return jsonify({
        'keywords': file_keywords,
        'rows': all_rows
    })


@app.route('/api/keywords/add', methods=['POST'])
def add_keyword():
    from flask import request
    data = request.get_json()
    keyword = data.get('keyword', '').strip()
    
    if not keyword:
        return jsonify({'success': False, 'error': 'Keyword cannot be empty'}), 400
    
    if keyword in runtime_keywords:
        return jsonify({'success': False, 'error': 'Keyword already exists'}), 400
    
    runtime_keywords.append(keyword)
    return jsonify({'success': True, 'keywords': runtime_keywords})


@app.route('/api/keywords/remove', methods=['POST'])
def remove_keyword():
    from flask import request
    data = request.get_json()
    keyword = data.get('keyword', '').strip()
    
    if keyword in runtime_keywords:
        runtime_keywords.remove(keyword)
        return jsonify({'success': True, 'keywords': runtime_keywords})
    
    return jsonify({'success': False, 'error': 'Keyword not found'}), 404


@app.route('/api/keywords/clear', methods=['POST'])
def clear_keywords():
    global runtime_keywords
    runtime_keywords = []
    return jsonify({'success': True, 'keywords': runtime_keywords})


@app.route('/api/keywords/reload', methods=['POST'])
def reload_keywords():
    # This just returns the current file keywords, doesn't affect runtime keywords
    file_keywords = load_keywords()
    return jsonify({'success': True, 'file_keywords': file_keywords})


@app.route('/api/volume/refresh-matched', methods=['POST'])
def refresh_matched_volumes():
    """Refresh volume data for all matched tickers"""
    from flask import request
    data = request.get_json()
    tickers = data.get('tickers', [])
    
    refreshed = []
    for ticker in tickers:
        try:
            metrics = fetch_volume(ticker)
            # Update cache
            for row in all_rows:
                if ticker in row['tickers']:
                    row['volumes'][ticker] = metrics
            refreshed.append(ticker)
        except Exception as e:
            print(f"Error refreshing {ticker}: {e}", flush=True)
    
    return jsonify({'success': True, 'refreshed': refreshed})


@app.route('/api/volume/<ticker>')
def get_volume(ticker):
    from flask import request
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    
    # If force refresh is requested (hover), always fetch new data
    if force_refresh:
        metrics = fetch_volume(ticker)
        # Update cache in all rows that have this ticker
        for row in all_rows:
            if ticker in row['tickers']:
                row['volumes'][ticker] = metrics
        return jsonify({'metrics': metrics})
    
    # Check if we already have this volume cached in any row
    for row in all_rows:
        if ticker in row['volumes']:
            return jsonify({'metrics': row['volumes'][ticker]})
    
    # Fetch it for the first time
    metrics = fetch_volume(ticker)
    
    # Cache it in all rows that have this ticker
    for row in all_rows:
        if ticker in row['tickers']:
            row['volumes'][ticker] = metrics
    
    return jsonify({'metrics': metrics})


@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)


def worker():
    global all_rows
    import sys
    try:
        print("Scanner starting...", file=sys.stderr, flush=True)
        
        # first pull
        initial = fetch_once()
        print(f"Fetched {len(initial)} items", file=sys.stderr, flush=True)
        all_rows.extend(initial)
        print("Initial fetch complete", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"Worker error: {e}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc(file=sys.stderr)

    while True:
        poll_interval = config.get("refresh", {}).get("feed_poll_interval_seconds", 15)
        time.sleep(poll_interval)
        
        try:
            new_items = fetch_once()
            if new_items:
                for item in reversed(new_items):
                    all_rows.insert(0, item)
                print(f"Added {len(new_items)} new items", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"Error fetching news: {e}", file=sys.stderr, flush=True)


# Start the worker thread
t = threading.Thread(target=worker, daemon=True)
t.start()

if __name__ == '__main__':
    print("Starting web server on http://localhost:5001")
    print("Press Ctrl+C to stop")
    app.run(debug=False, host='0.0.0.0', port=5001, threaded=True)
