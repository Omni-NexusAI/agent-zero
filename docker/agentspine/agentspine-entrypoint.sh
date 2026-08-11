#!/bin/sh
set -eu

# This runs before the upstream initializer copies the image's A0 v2.7 source
# tree to /a0.  It only removes stale Spine *source* duplicates from the user
# plugin root; config-only directories remain the supported persistent state.
/opt/venv-a0/bin/python /usr/local/lib/agentspine/sanitize_spine_runtime_plugins.py

exec "$@"
