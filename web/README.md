# Web Scanner README

This folder contains the web-based version of the Finviz news scanner.

## Structure

```
web/
├── scanner_web.py          # Flask backend server
├── requirements-web.txt    # Python dependencies for web version
├── run-web.sh              # Launch script
├── README.md               # This file
└── static/
    ├── index.html          # Main HTML page
    ├── style.css           # Styling (dark hacker theme)
    └── app.js              # Frontend JavaScript
```

## Features

- **Real-time Updates**: Auto-refreshes feed every 15 seconds
- **Progressive Volume Loading**: Shows matched signals immediately, fetches volumes progressively
- **Volume Caching**: Volumes are cached to avoid redundant API calls
- **Dark Theme**: Hacker-style green-on-black interface
- **Responsive Design**: Works on desktop and mobile browsers

## Running

### From project root:
```bash
./run-web.sh
```

### From web directory:
```bash
cd web
./run-web.sh
```

Then open http://localhost:5001 in your browser.

## API Endpoints

- `GET /` - Serves the main HTML page
- `GET /api/feed` - Returns all news items and keywords
- `GET /api/volume/<ticker>` - Fetches volume for a specific ticker

## Notes

- The `keywords.txt` file is in the parent directory (project root)
- Port 5001 is used (port 5000 conflicts with macOS AirPlay)
- Flask runs in single-threaded mode with a background worker thread
- Virtual environment is shared with the desktop version (in `../venv/`)

