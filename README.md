# Finviz Scanner

Monitors Finviz news and alerts you when keywords match.

## Setup

1. Edit `keywords.txt` - add one keyword per line
2. Run it

## Run

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python scanner.py
```

On macOS you might need: `brew install python-tk`

Or use the helper script:
```bash
./run-local.sh
```

## How it works

Checks Finviz every 15 seconds. Shows matching news in the top panel, all news in the bottom. Keywords auto-reload when you edit `keywords.txt`.
