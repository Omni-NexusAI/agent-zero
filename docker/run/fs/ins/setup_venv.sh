#!/bin/bash
set -e

if [ -d /opt/venv ]; then
    source /opt/venv/bin/activate
else
    source /opt/venv-a0/bin/activate
fi
