#!/bin/sh
# Astro Imaging Planner: nightly backup.
#
# Makes one bundle per run in /var/backups/astro-planner:
#     planner-YYYY-MM-DD.tar.gz
# containing
#     planner.db             a consistent copy of the database (safe while the app runs)
#     astro-planner.env      the settings file, including the secret key
#     nginx-astro-planner    the nginx site file (HTTPS lines included)
#     MANIFEST.txt           when it was made, integrity check, member/site/log counts
#
# Bundles older than KEEP_DAYS are deleted. Run as the 'astro' user (cron does this).
#
# Install:
#   sudo cp /opt/astro-planner/deploy/backup.sh /usr/local/bin/astro-planner-backup
#   sudo chmod 755 /usr/local/bin/astro-planner-backup
#   echo '17 3 * * * astro /usr/local/bin/astro-planner-backup' | sudo tee /etc/cron.d/astro-planner
set -eu
umask 027                                   # bundles readable by owner + 'astro' group only

APP_DIR=${APP_DIR:-/opt/astro-planner}
DB=${DB:-/var/lib/astro-planner/planner.db}
DEST=${DEST:-/var/backups/astro-planner}
ENV_FILE=${ENV_FILE:-/etc/astro-planner.env}
NGINX_SITE=${NGINX_SITE:-/etc/nginx/sites-available/astro-planner}
KEEP_DAYS=${KEEP_DAYS:-30}
PY=${PY:-$APP_DIR/venv/bin/python}

STAMP=$(date +%F)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$DEST"
cd "$APP_DIR"
AIP_DB="$DB" "$PY" manage.py backup "$WORK/planner.db" >/dev/null
[ -r "$ENV_FILE" ]   && cp "$ENV_FILE" "$WORK/astro-planner.env"
[ -r "$NGINX_SITE" ] && cp "$NGINX_SITE" "$WORK/nginx-astro-planner"
{
  echo "Astro Imaging Planner backup"
  echo "Made:    $(date '+%Y-%m-%d %H:%M:%S %Z') on $(hostname)"
  AIP_DB="$WORK/planner.db" "$PY" manage.py verify "$WORK/planner.db"
} > "$WORK/MANIFEST.txt"

FILES=$(cd "$WORK" && ls planner.db MANIFEST.txt astro-planner.env nginx-astro-planner 2>/dev/null)
tar -czf "$DEST/planner-$STAMP.tar.gz.part" -C "$WORK" $FILES
mv "$DEST/planner-$STAMP.tar.gz.part" "$DEST/planner-$STAMP.tar.gz"   # never leave a half-written bundle
find "$DEST" -name 'planner-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
