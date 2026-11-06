#!/bin/sh
# Sets up the server for Cuber Hub, or updates its set-up (a new relay version, changed nginx sites):
# copies deploy/server to the server and runs its install.sh there as root. See deploy/README.md.
#
#   sh deploy/setup-server.sh [ssh-host]      # the host defaults to digital-ocean
set -eu

HOST=${1:-digital-ocean}
cd "$(dirname "$0")"

ssh "$HOST" 'install -d /opt/cuberhub/deploy'
rsync -az --delete server/ "$HOST:/opt/cuberhub/deploy/"
ssh "$HOST" 'sh /opt/cuberhub/deploy/install.sh'
