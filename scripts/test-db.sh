#!/usr/bin/env bash
# A throwaway local Postgres for tests, no Docker needed. Uses Homebrew's postgresql@15 (or 14/16).
# Usage: scripts/test-db.sh start|stop|status   then: SEQ_TEST_DB_DSN=postgres://oseq@127.0.0.1:54329/opensequence_test
set -euo pipefail
PORT="${SEQ_TEST_DB_PORT:-54329}"
DIR="${SEQ_TEST_DB_DIR:-${TMPDIR:-/tmp}/opensequence-test-pg}"
for v in 16 15 14; do
  if [ -x "/opt/homebrew/opt/postgresql@$v/bin/pg_ctl" ]; then PGBIN="/opt/homebrew/opt/postgresql@$v/bin"; break; fi
done
PGBIN="${PGBIN:-$(dirname "$(command -v pg_ctl)")}"
case "${1:-start}" in
  start)
    if [ ! -d "$DIR" ]; then "$PGBIN/initdb" -D "$DIR" -U oseq --auth=trust -E UTF8 >/dev/null; fi
    "$PGBIN/pg_ctl" -D "$DIR" -o "-p $PORT -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off -c full_page_writes=off" -l "$DIR/server.log" start >/dev/null || true
    sleep 1
    "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U oseq -d postgres -tAc "select 1 from pg_database where datname='opensequence_test'" | grep -q 1 || \
      "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U oseq -d postgres -c "create database opensequence_test" >/dev/null
    echo "SEQ_TEST_DB_DSN=postgres://oseq@127.0.0.1:$PORT/opensequence_test"
    ;;
  stop) "$PGBIN/pg_ctl" -D "$DIR" stop -m fast >/dev/null && echo stopped ;;
  status) "$PGBIN/pg_ctl" -D "$DIR" status ;;
  *) echo "usage: $0 start|stop|status" >&2; exit 2 ;;
esac
