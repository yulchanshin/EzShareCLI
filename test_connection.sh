#!/bin/bash

# Test script to verify P2P connection works
set -e

echo "=== EzShare Connection Test ==="
echo "Testing simple file transfer..."

# Ensure we have test data
if [ ! -f "test_data/sample.txt" ]; then
  echo "Error: test_data/sample.txt not found"
  exit 1
fi

# Clean up any previous test output
rm -rf /tmp/ezshare_test_output
mkdir -p /tmp/ezshare_test_output

echo "Starting sender in background..."
# Run sender in background, capture share key
npx tsx src/cli.tsx send test_data/sample.txt > /tmp/sender.log 2>&1 &
SENDER_PID=$!

# Wait for sender to generate share key
sleep 2

# Extract share key from sender log
SHARE_KEY=$(grep -oP '(?<=Share this key with receiver:\n)[A-Z0-9-]+' /tmp/sender.log || true)

if [ -z "$SHARE_KEY" ]; then
  echo "Error: Could not extract share key from sender"
  cat /tmp/sender.log
  kill $SENDER_PID 2>/dev/null || true
  exit 1
fi

echo "Share key: $SHARE_KEY"
echo "Starting receiver..."

# Run receiver
npx tsx src/cli.tsx receive "$SHARE_KEY" --output /tmp/ezshare_test_output > /tmp/receiver.log 2>&1 &
RECEIVER_PID=$!

# Wait for both processes to complete (max 30 seconds)
TIMEOUT=30
elapsed=0
while [ $elapsed -lt $TIMEOUT ]; do
  # Check if both processes are still running
  if ! kill -0 $SENDER_PID 2>/dev/null && ! kill -0 $RECEIVER_PID 2>/dev/null; then
    echo "Both processes completed"
    break
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done

# Kill processes if still running
kill $SENDER_PID 2>/dev/null || true
kill $RECEIVER_PID 2>/dev/null || true

echo ""
echo "=== Sender Log ==="
cat /tmp/sender.log
echo ""
echo "=== Receiver Log ==="
cat /tmp/receiver.log
echo ""

# Check if file was received
if [ -f "/tmp/ezshare_test_output/sample.txt" ]; then
  echo "✓ SUCCESS: File transferred successfully"
  diff test_data/sample.txt /tmp/ezshare_test_output/sample.txt
  if [ $? -eq 0 ]; then
    echo "✓ File contents match perfectly"
  else
    echo "✗ FAIL: File contents differ"
    exit 1
  fi
else
  echo "✗ FAIL: File was not received"
  exit 1
fi

# Clean up
rm -rf /tmp/ezshare_test_output /tmp/sender.log /tmp/receiver.log

echo ""
echo "=== All tests passed! ==="
