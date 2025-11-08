#!/bin/bash

echo "Running initialization script..."

# GIT_REF from parameter (can be branch name or tag)
if [ -z "$1" ]; then
    echo "Error: GIT_REF parameter is empty. Please provide a valid branch name or tag."
    exit 1
fi
GIT_REF="$1"
# Backward compatibility
BRANCH="$GIT_REF"

# Export build version from file (computed during Docker build)
if [ -f /a0_build_version.txt ]; then
    export A0_BUILD_VERSION=$(cat /a0_build_version.txt | tr -d '\n\r')
    echo "A0_BUILD_VERSION set to: $A0_BUILD_VERSION"
    # Also add to /etc/environment for all processes
    echo "A0_BUILD_VERSION=\"$A0_BUILD_VERSION\"" >> /etc/environment
else
    echo "WARNING: /a0_build_version.txt not found, A0_BUILD_VERSION not set"
fi

# Copy all contents from persistent /per to root directory (/) without overwriting
cp -r --no-preserve=ownership,mode /per/* /

# allow execution of /root/.bashrc and /root/.profile
chmod 444 /root/.bashrc
chmod 444 /root/.profile

# update package list to save time later
apt-get update > /dev/null 2>&1 &

# let supervisord handle the services
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
