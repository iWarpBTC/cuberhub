#!/bin/sh
# Releases what is in this working copy to https://cuberhub.cz: tests, build, upload. See deploy/README.md.
#
#   npm run deploy            # or: sh deploy/deploy.sh [ssh-host]
set -eu

HOST=${1:-digital-ocean}
WEB_ROOT=/var/www/cuberhub
cd "$(dirname "$0")/.."

npm test
npm run build

# The new hashed files first, then the page that names them, and only then are the old ones removed:
# someone loading the app in the middle gets a page whose files are all there.
# (-rlpt and not -a: on the server the files belong to the user who receives them, not to this machine's.)
rsync -rlptz dist/assets/ "$HOST:$WEB_ROOT/assets/"
rsync -rlptz --delete dist/ "$HOST:$WEB_ROOT/"
echo "released to https://cuberhub.cz"
