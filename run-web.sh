#!/bin/bash

# Launcher for web version - delegates to web/run-web.sh

cd "$(dirname "$0")/web"
./run-web.sh
