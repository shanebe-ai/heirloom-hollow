#!/bin/bash
# Runs every minute from cron on server 1. If main on GitHub has moved on,
# pull it, rebuild and restart the game. Otherwise it does nothing.
set -e
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
APP_DIR=${APP_DIR:-/home/heirloom}
cd "$APP_DIR"

# Never run two updates at once if a build takes longer than a minute.
exec 9>/tmp/heirloom-deploy.lock
flock -n 9 || exit 0

git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && exit 0

echo "$(date) updating to $(git rev-parse --short origin/main)"
git reset -q --hard origin/main
npm ci --silent
npm run build --silent
pm2 startOrRestart ecosystem.config.cjs
echo "$(date) done"
