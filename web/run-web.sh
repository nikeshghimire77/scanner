#!/bin/bash

# Run web version (Flask server)

set -e

echo "Setting up Python environment..."
if [ ! -d "../venv" ]; then
    cd ..
    python3 -m venv venv
    cd web
fi

source ../venv/bin/activate

echo "Installing dependencies..."
pip install -q -r requirements-web.txt

echo ""
echo "Starting web scanner..."
echo "Open http://localhost:5001 in your browser"
echo ""

python scanner_web.py
