#!/bin/sh
# Sets up Cuber Hub on the server, or brings an earlier set-up up to date. Run as root on the server, from
# the copy of deploy/server that deploy/setup-server.sh puts in /opt/cuberhub/deploy. Running it again is
# safe: every step first looks at what is already there.
#
# It creates: the user cuberhub-relay with the relay in /opt/cuberhub/relay and its service;
# /var/www/cuberhub; the certificates for cuberhub.cz (with www) and relay.cuberhub.cz; and the two
# nginx sites. It touches no other site.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
WEB_ROOT=/var/www/cuberhub
RELAY_PORT=26547

[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }

echo "== relay"
id cuberhub-relay >/dev/null 2>&1 || useradd --system --home-dir /var/lib/cuberhub-relay --shell /usr/sbin/nologin cuberhub-relay
install -d /opt/cuberhub/relay
cp "$HERE/relay/package.json" "$HERE/relay/package-lock.json" /opt/cuberhub/relay/
# Exactly the versions of the lock file; the relay comes with its SQLite built, so nothing is compiled.
(cd /opt/cuberhub/relay && npm ci --omit=dev --no-audit --no-fund)
cp "$HERE/cuberhub-relay.service" /etc/systemd/system/cuberhub-relay.service
systemctl daemon-reload
systemctl enable cuberhub-relay
systemctl restart cuberhub-relay
# The relay answers /health once its database is open.
i=0
until curl -fsS "http://127.0.0.1:$RELAY_PORT/health" >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -lt 20 ] || { echo "the relay does not answer; see: journalctl -u cuberhub-relay" >&2; exit 1; }
  sleep 1
done
echo "relay is up on 127.0.0.1:$RELAY_PORT"

echo "== site files"
install -d -m 755 "$WEB_ROOT"

echo "== certificates"
# certbot answers the challenge through the running nginx and needs no site of ours for it.
[ -d /etc/letsencrypt/live/cuberhub.cz ] || certbot certonly --nginx --non-interactive -d cuberhub.cz -d www.cuberhub.cz
[ -d /etc/letsencrypt/live/relay.cuberhub.cz ] || certbot certonly --nginx --non-interactive -d relay.cuberhub.cz

echo "== nginx"
for site in cuberhub.cz relay.cuberhub.cz; do
  [ ! -f "/etc/nginx/sites-available/$site" ] || cp "/etc/nginx/sites-available/$site" "/etc/nginx/sites-available/$site.previous"
  cp "$HERE/$site.conf" "/etc/nginx/sites-available/$site"
  ln -sf "/etc/nginx/sites-available/$site" "/etc/nginx/sites-enabled/$site"
done
if ! nginx -t; then
  # Leave nginx as it was: a configuration that does not load must not wait for the next reload.
  for site in cuberhub.cz relay.cuberhub.cz; do
    if [ -f "/etc/nginx/sites-available/$site.previous" ]; then
      mv "/etc/nginx/sites-available/$site.previous" "/etc/nginx/sites-available/$site"
    else
      rm -f "/etc/nginx/sites-enabled/$site" "/etc/nginx/sites-available/$site"
    fi
  done
  echo "the new nginx configuration does not load; nginx was left as it was" >&2
  exit 1
fi
rm -f /etc/nginx/sites-available/cuberhub.cz.previous /etc/nginx/sites-available/relay.cuberhub.cz.previous
systemctl reload nginx

echo "== done"
echo "https://cuberhub.cz serves $WEB_ROOT (empty until the first deploy); wss://relay.cuberhub.cz is the relay."
