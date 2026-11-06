# Deploying Cuber Hub

The app is static files; the only service is the relay that devices sync through.

| What | Where on the server |
| --- | --- |
| The built app, served at https://cuberhub.cz | `/var/www/cuberhub` |
| The sync relay, at wss://relay.cuberhub.cz | `cuberhub-relay.service`, on `127.0.0.1:26547` behind nginx |
| The relay's program (the Evolu relay from npm, pinned) | `/opt/cuberhub/relay` |
| The relay's database (encrypted changes of every user) | `/var/lib/cuberhub-relay/data` |
| A copy of `deploy/server`, as last installed | `/opt/cuberhub/deploy` |
| nginx sites | `/etc/nginx/sites-available/cuberhub.cz`, `…/relay.cuberhub.cz` |

The server is the one behind the SSH host `digital-ocean` (Debian, nginx, Node 24, certbot); both names
point to it in DNS.

## Releasing

```sh
npm run deploy
```

runs the tests, builds, and uploads `dist/` (`deploy/deploy.sh`). To give the release a new version, run
`npm run bump` first and commit: it sets the next year.month.build (26.11.01, 26.11.02, …, 26.12.01), which
the app shows at the bottom of its home page together with the commit. The build takes the relay's address from
`.env.production`. New files go up before the page that names them and old ones are removed last, so
nobody loads a half-released app.

Releases are made by hand, from this machine, as the server's root; nothing deploys on its own.

## Setting up the server

Once, and again whenever something in `deploy/server` changes (a new relay version, the nginx sites, the
service):

```sh
sh deploy/setup-server.sh
```

It copies `deploy/server` to the server and runs `install.sh` there as root, which

1. creates the user `cuberhub-relay`, installs the relay with `npm ci` and (re)starts its service;
2. creates the web root;
3. gets the certificates for `cuberhub.cz` (with `www`) and `relay.cuberhub.cz` from Let's Encrypt, if they
   are not there yet (certbot renews them like the server's other ones);
4. installs the two nginx sites and reloads nginx, but only if `nginx -t` accepts the configuration;
   otherwise it puts back what was there and stops.

It changes nothing else on the server, and running it again is safe.

## The relay

- It is Evolu's reference relay (`@evolu/relay`), at the version in `deploy/server/relay/package.json`.
  When the app's `@evolu/*` packages are updated, read Evolu's release notes, set the matching relay
  version there, run `npm install --package-lock-only` in that directory and then
  `sh deploy/setup-server.sh`.
- It cannot read what it stores: changes are encrypted on the devices. It sees who (a random owner id),
  when and how much.
- It admits any device that connects, so anyone who finds it can store data. Each owner is limited to
  50 MiB (`EVOLU_RELAY_MAX_OWNER_BYTES` in the service) and nginx allows 20 connections per address, but
  nothing limits the number of owners: keep an eye on the disk
  (`du -sh /var/lib/cuberhub-relay`).
- Its database only grows; deleting in the app marks rows deleted. Losing it loses nobody's data: every
  device has all of its own and sends the relay what it lacks. Still, back up
  `/var/lib/cuberhub-relay/data` with the server's other data if a device may be someone's only copy.
- Logs: `journalctl -u cuberhub-relay`. Health: `curl http://127.0.0.1:26547/health` on the server, or
  `https://relay.cuberhub.cz/health` from anywhere.

## The site

- `www.cuberhub.cz` redirects to `cuberhub.cz`: browsers keep the app's data per address, so there must
  be only one.
- The page is sent with a Content-Security-Policy that allows only its own scripts and its own relay
  (`deploy/server/cuberhub.cz.conf`). A new outside resource (a font, an API, another relay) has to be
  added there, or the browser blocks it.
- Hashed files in `/assets/` are cached for a year; the page itself is revalidated every time, so a
  release shows up on the next load.
