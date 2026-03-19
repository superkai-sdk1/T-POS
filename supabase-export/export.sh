#!/bin/bash

# Supabase Export Script
# Project: TPOS (dscadajjthbcrullhwtx)

BASE_URL="https://dscadajjthbcrullhwtx.supabase.co"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzY2FkYWpqdGhiY3J1bGxod3R4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU3MzEzMCwiZXhwIjoyMDg4MTQ5MTMwfQ.6I5Gkv1eS9c1_2YbrDnAxhMfZnL95LqwToKsYuusEh0"
OUT_DIR="$(dirname "$0")/data"

mkdir -p "$OUT_DIR"

TABLES=(
  profiles
  inventory
  menu_categories
  modifiers
  spaces
  shifts
  checks
  check_items
  check_payments
  transactions
  supplies
  discounts
  bookings
  certificates
  events
  revisions
  expenses
  salary_payments
  bonus_history
  refunds
  cash_operations
  notifications
  tg_link_requests
  app_settings
)

echo "=== Supabase Data Export ==="
echo "Project: dscadajjthbcrullhwtx"
echo "Started: $(date)"
echo ""

# Export each table with pagination
for TABLE in "${TABLES[@]}"; do
  echo -n "Exporting $TABLE... "

  ALL_ROWS="[]"
  OFFSET=0
  LIMIT=1000
  TOTAL=0

  while true; do
    RESPONSE=$(curl -s \
      -H "apikey: $SERVICE_KEY" \
      -H "Authorization: Bearer $SERVICE_KEY" \
      -H "Accept: application/json" \
      -H "Prefer: count=exact" \
      "$BASE_URL/rest/v1/$TABLE?select=*&limit=$LIMIT&offset=$OFFSET" \
      -D /tmp/headers_$TABLE)

    # Check for error
    if echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if isinstance(d,list) else 1)" 2>/dev/null; then
      COUNT=$(echo "$RESPONSE" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
      TOTAL=$((TOTAL + COUNT))

      if [ "$OFFSET" -eq 0 ]; then
        ALL_ROWS="$RESPONSE"
      else
        ALL_ROWS=$(python3 -c "
import sys, json
existing = json.loads('$ALL_ROWS' if len('$ALL_ROWS') < 10000 else open('/tmp/partial_$TABLE.json').read())
new = json.loads(sys.argv[1])
print(json.dumps(existing + new, ensure_ascii=False, indent=2))
" "$RESPONSE")
      fi

      # Save partial to temp file for large datasets
      echo "$ALL_ROWS" > /tmp/partial_$TABLE.json

      if [ "$COUNT" -lt "$LIMIT" ]; then
        break
      fi
      OFFSET=$((OFFSET + LIMIT))
    else
      echo "ERROR: $RESPONSE"
      break
    fi
  done

  # Save final result
  if [ -f "/tmp/partial_$TABLE.json" ]; then
    cp "/tmp/partial_$TABLE.json" "$OUT_DIR/${TABLE}.json"
    rm -f "/tmp/partial_$TABLE.json"
  else
    echo "$ALL_ROWS" > "$OUT_DIR/${TABLE}.json"
  fi

  echo "✓ $TOTAL rows"
done

echo ""
echo "=== Exporting Auth Users ==="
AUTH_RESPONSE=$(curl -s \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  "$BASE_URL/auth/v1/admin/users?page=1&per_page=1000")

echo "$AUTH_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'✓ {len(d[\"users\"])} auth users')" 2>/dev/null || echo "  (no auth users or error)"
echo "$AUTH_RESPONSE" > "$OUT_DIR/auth_users.json"

echo ""
echo "=== Exporting Storage Buckets ==="
BUCKETS_RESPONSE=$(curl -s \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  "$BASE_URL/storage/v1/bucket")
echo "$BUCKETS_RESPONSE" > "$OUT_DIR/storage_buckets.json"
echo "$BUCKETS_RESPONSE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if isinstance(d,list):
    for b in d: print(f'  Bucket: {b[\"name\"]}')
" 2>/dev/null

# Export storage objects list for each bucket
BUCKET_NAMES=$(echo "$BUCKETS_RESPONSE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if isinstance(d,list):
    for b in d: print(b['name'])
" 2>/dev/null)

for BUCKET in $BUCKET_NAMES; do
  echo -n "  Listing objects in $BUCKET... "
  OBJECTS=$(curl -s \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -X POST \
    -d '{"limit":1000,"offset":0,"sortBy":{"column":"name","order":"asc"}}' \
    "$BASE_URL/storage/v1/object/list/$BUCKET")
  echo "$OBJECTS" > "$OUT_DIR/storage_${BUCKET}_objects.json"
  COUNT=$(echo "$OBJECTS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null)
  echo "✓ $COUNT files"
done

echo ""
echo "=== Export Complete ==="
echo "Files saved to: $OUT_DIR"
ls -lh "$OUT_DIR/"
