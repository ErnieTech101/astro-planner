#!/bin/sh
# Astro Imaging Planner: restore the database from a backup bundle or a .db file.
#
#   sudo sh /opt/astro-planner/deploy/restore.sh /var/backups/astro-planner/planner-2026-10-19.tar.gz
#   sudo sh /opt/astro-planner/deploy/restore.sh ~/planner-2026-10-19-0915.db      (from Download Backup)
#
# What it does:
#   1. checks the backup's database is intact before touching anything
#   2. stops the app
#   3. keeps the current database as planner.db.before-restore-<time>   (so a restore can be undone)
#   4. puts the backup in place, fixes ownership, starts the app, checks it answers
#
# It restores the DATABASE only. Settings and the nginx file in a bundle are left for you to copy by hand
# (see the Administrator's Guide), because on a working server they should not change.
set -eu

SRC=${1:-}
APP_DIR=${APP_DIR:-/opt/astro-planner}
DB=${DB:-/var/lib/astro-planner/planner.db}
PY=${PY:-$APP_DIR/venv/bin/python}
OWNER=${OWNER:-astro:astro}
SYSTEMCTL=${SYSTEMCTL:-systemctl}
SERVICE=astro-planner

if [ -z "$SRC" ] || [ ! -f "$SRC" ]; then
  echo "Usage: sudo sh $0 <backup .tar.gz or .db file>" >&2
  exit 2
fi
if [ "$(id -u)" -ne 0 ] && [ "$SYSTEMCTL" = systemctl ]; then
  echo "Run this with sudo." >&2
  exit 2
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

case "$SRC" in
  *.tar.gz|*.tgz) tar -xzf "$SRC" -C "$WORK"
                  [ -f "$WORK/planner.db" ] || { echo "No planner.db inside $SRC" >&2; exit 1; } ;;
  *.db|*.db.before-restore-*) cp "$SRC" "$WORK/planner.db" ;;
  *) echo "Expected a .tar.gz bundle or a .db file." >&2; exit 2 ;;
esac

echo "Checking the backup…"
if ! "$PY" "$APP_DIR/manage.py" verify "$WORK/planner.db"; then
  echo "The backup failed its integrity check. Nothing was changed." >&2
  exit 1
fi

printf "Replace the live database with this backup? Type yes: "
read -r answer
[ "$answer" = yes ] || { echo "Cancelled. Nothing was changed."; exit 1; }

$SYSTEMCTL stop "$SERVICE"
if [ -f "$DB" ]; then
  KEEP="$DB.before-restore-$(date +%Y%m%d-%H%M%S)"
  cp "$DB" "$KEEP"
  echo "Kept the old database as $KEEP"
fi
rm -f "$DB-wal" "$DB-shm"
cp "$WORK/planner.db" "$DB"
chown "$OWNER" "$DB" 2>/dev/null || true
chmod 640 "$DB"
$SYSTEMCTL start "$SERVICE"

sleep 2
if [ "$SYSTEMCTL" = systemctl ]; then
  if curl -fsS http://127.0.0.1:8077/healthz >/dev/null; then
    echo "Restore complete. The app is running."
  else
    echo "Restored, but the app is not answering. Check: sudo systemctl status $SERVICE" >&2
    exit 1
  fi
else
  echo "Restore complete."
fi
