#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to a disposable PostgreSQL database}"

PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1)

"${PSQL[@]}" -f tests/integration/bootstrap.sql

for migration in supabase/migrations/*.sql; do
  echo "Applying ${migration}"
  "${PSQL[@]}" -f "$migration"
done

for test_file in tests/integration/domain_*.sql; do
  echo "Running ${test_file}"
  "${PSQL[@]}" -f "$test_file"
done

echo "Database integration checks passed."
