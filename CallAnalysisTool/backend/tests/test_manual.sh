#!/bin/bash
# Manual testing script for the API
# Run this after starting the Flask server

API_URL="http://localhost:5001/api"

# Detect script location and find test file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_FILE="$SCRIPT_DIR/test_transcript.json"

# If running from backend/ directory, use tests/ prefix
if [ ! -f "$TEST_FILE" ]; then
    TEST_FILE="$SCRIPT_DIR/../tests/test_transcript.json"
fi

echo "==================================="
echo "Testing EMS Call Analysis API"
echo "==================================="
echo ""

# Test 1: Health check
echo "Test 1: Health Check"
echo "GET $API_URL/health"
curl -s "$API_URL/health" | python3 -m json.tool
echo ""
echo ""

# Test 2: Grade a transcript
echo "Test 2: Grade Transcript (no evidence)"
echo "POST $API_URL/grade"
curl -s -X POST "$API_URL/grade" \
  -H "Content-Type: application/json" \
  -d @"$TEST_FILE" | python3 -m json.tool
echo ""
echo ""

# Test 3: Grade with evidence
echo "Test 3: Grade Transcript (with evidence)"
echo "POST $API_URL/grade?show_evidence=true"
curl -s -X POST "$API_URL/grade?show_evidence=true" \
  -H "Content-Type: application/json" \
  -d @"$TEST_FILE" | python3 -m json.tool
echo ""
echo ""

# Test 4: Rule-based endpoint (alias)
echo "Test 4: Rule-based Endpoint"
echo "POST $API_URL/grade/rule"
curl -s -X POST "$API_URL/grade/rule" \
  -H "Content-Type: application/json" \
  -d @"$TEST_FILE" | python3 -m json.tool
echo ""
echo ""

echo "==================================="
echo "All tests complete!"
echo "==================================="

