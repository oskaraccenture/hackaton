#!/usr/bin/env bash
# Characterization tests for the spring-music monolith.
# Run these against http://localhost:8080 BEFORE making any changes.
# They pin actual behavior — including quirks. Do not "fix" assertions.
# Usage: ./run.sh [BASE_URL]
# Default BASE_URL: http://localhost:8080

BASE_URL="${1:-http://localhost:8080}"
PASS=0
FAIL=0
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

check() {
  local name="$1"
  local expected_status="$2"
  local actual_status="$3"
  local body="$4"
  local body_check="$5"

  local status_ok=false
  local body_ok=true

  [[ "$actual_status" == "$expected_status" ]] && status_ok=true

  if [[ -n "$body_check" ]]; then
    echo "$body" | grep -q "$body_check" || body_ok=false
  fi

  if $status_ok && $body_ok; then
    echo -e "${GREEN}PASS${NC} $name"
    ((PASS++))
  else
    echo -e "${RED}FAIL${NC} $name"
    [[ "$actual_status" != "$expected_status" ]] && echo "      status: expected=$expected_status actual=$actual_status"
    ! $body_ok && echo "      body missing: $body_check"
    ((FAIL++))
  fi
}

echo "=== Characterization tests: spring-music @ $BASE_URL ==="
echo ""

# ---- GET /albums ----

RESP=$(curl -s -o /tmp/ct_body.json -w "%{http_code}" "$BASE_URL/albums")
BODY=$(cat /tmp/ct_body.json)
check "GET /albums returns 200" "200" "$RESP"
check "GET /albums returns a JSON array" "200" "$RESP" "$BODY" '"title"'
check "GET /albums includes 'id' field" "200" "$RESP" "$BODY" '"id"'
check "GET /albums includes 'artist' field" "200" "$RESP" "$BODY" '"artist"'
check "GET /albums includes 'genre' field" "200" "$RESP" "$BODY" '"genre"'
check "GET /albums includes 'trackCount' field" "200" "$RESP" "$BODY" '"trackCount"'
check "GET /albums includes 'releaseYear' field" "200" "$RESP" "$BODY" '"releaseYear"'

# Characterize: does the legacy response include Spring-internal '_class' field?
# If it does, that is a known leak we must strip in the new service.
if echo "$BODY" | grep -q '"_class"'; then
  echo "  [KNOWN ISSUE] GET /albums leaks '_class' Spring metadata — must be stripped in album-service ACL"
fi

# ---- GET /albums/:id ----

# Extract first album id from list
FIRST_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//')
if [[ -n "$FIRST_ID" ]]; then
  RESP2=$(curl -s -o /tmp/ct_album.json -w "%{http_code}" "$BASE_URL/albums/$FIRST_ID")
  BODY2=$(cat /tmp/ct_album.json)
  check "GET /albums/:id returns 200" "200" "$RESP2"
  check "GET /albums/:id returns correct id" "200" "$RESP2" "$BODY2" "\"$FIRST_ID\""
else
  echo "  [SKIP] GET /albums/:id — could not extract id from album list"
fi

RESP3=$(curl -s -o /tmp/ct_404.json -w "%{http_code}" "$BASE_URL/albums/nonexistent-id-00000")
check "GET /albums/:id 404 for missing album" "404" "$RESP3"

# ---- POST /albums ----

RESP4=$(curl -s -o /tmp/ct_create.json -w "%{http_code}" \
  -X POST "$BASE_URL/albums" \
  -H "Content-Type: application/json" \
  -d '{"title":"Characterization Test Album","artist":"Test Artist","releaseYear":"2024","genre":"Test","trackCount":1}')
BODY4=$(cat /tmp/ct_create.json)
check "POST /albums creates album (200 or 201)" "20" "${RESP4:0:2}"
check "POST /albums returns created album with id" "20" "${RESP4:0:2}" "$BODY4" '"id"'

# Save created id for cleanup
CREATED_ID=$(echo "$BODY4" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//')

# ---- PUT /albums/:id ----

if [[ -n "$CREATED_ID" ]]; then
  RESP5=$(curl -s -o /tmp/ct_update.json -w "%{http_code}" \
    -X PUT "$BASE_URL/albums/$CREATED_ID" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"$CREATED_ID\",\"title\":\"Updated Title\",\"artist\":\"Test Artist\",\"releaseYear\":\"2024\",\"genre\":\"Test\",\"trackCount\":2}")
  BODY5=$(cat /tmp/ct_update.json)
  check "PUT /albums/:id updates album" "200" "$RESP5"

  # ---- DELETE /albums/:id ----
  RESP6=$(curl -s -o /tmp/ct_delete.json -w "%{http_code}" \
    -X DELETE "$BASE_URL/albums/$CREATED_ID")
  check "DELETE /albums/:id returns 204 or 200" "20" "${RESP6:0:2}"
fi

# ---- Static frontend ----
RESP7=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
check "GET / serves frontend (200)" "200" "$RESP7"

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
[[ $FAIL -gt 0 ]] && exit 1 || exit 0
