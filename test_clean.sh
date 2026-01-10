#!/bin/bash

echo "=== Killing any existing EzShare processes ==="
pkill -f "tsx src/cli.tsx" || echo "No existing processes"
sleep 1

echo ""
echo "=== Rebuilding project ==="
npm run build

echo ""
echo "=== Starting SENDER in 3 seconds... ==="
echo "Press Ctrl+C to cancel, or wait..."
sleep 3

npx tsx dist/cli.js send test_data/sample.txt
