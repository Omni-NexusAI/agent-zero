#!/bin/bash

# Export build version from file (computed during Docker build)
if [ -f /a0_build_version.txt ]; then
    export A0_BUILD_VERSION=$(cat /a0_build_version.txt | tr -d '\n\r')
fi

. "/ins/setup_venv.sh" "$@"
. "/ins/copy_A0.sh" "$@"

python /a0/prepare.py --dockerized=true
# python /a0/preload.py --dockerized=true # no need to run preload if it's done during container build

echo "Starting A0..."
if [ -n "$A0_BUILD_VERSION" ]; then
    echo "Build version: $A0_BUILD_VERSION"
fi
exec python /a0/run_ui.py \
    --dockerized=true \
    --port=80 \
    --host="0.0.0.0"
    # --code_exec_ssh_enabled=true \
    # --code_exec_ssh_addr="localhost" \
    # --code_exec_ssh_port=22 \
    # --code_exec_ssh_user="root" \
    # --code_exec_ssh_pass="toor"
