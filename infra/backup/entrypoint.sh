#!/bin/sh
set -eu
umask 077
# Keep the lock descriptor across exec so Node receives container signals.
exec 9>/state/job.lock
if ! flock -n 9; then
  echo "Another New Messenger operational job is running" >&2
  exit 75
fi
exec node /opt/newmessenger/backup/main.mjs "$@"
