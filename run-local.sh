#!/bin/bash

# Run locally (no Docker) - window will pop up

set -e

echo "Setting up Python environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate

echo "Installing dependencies..."
pip install -q -r requirements.txt

echo ""
echo "Starting scanner..."
echo ""

python scanner.py

