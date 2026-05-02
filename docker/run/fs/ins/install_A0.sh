#!/bin/bash
set -e

# GIT_REF can be a branch name (for release-candidate tests) or a version tag.
if [ -z "$1" ]; then
    echo "Error: GIT_REF parameter is empty. Please provide a valid branch name or tag."
    exit 1
fi
GIT_REF="$1"

if [ "$GIT_REF" = "local" ]; then
    echo "Using local dev files in /git/agent-zero"
else
    echo "Cloning $GIT_REF from Omni-NexusAI Agentspine repository..."
    git clone -b "$GIT_REF" "https://github.com/Omni-NexusAI/agentspine" "/git/agent-zero" || {
        echo "CRITICAL ERROR: Failed to clone $GIT_REF from Omni-NexusAI/agentspine"
        exit 1
    }
fi

echo "Computing build version from git repository (variant: ${BUILD_VARIANT:-standard})..."
BUILD_VERSION=$(BUILD_VARIANT="$BUILD_VARIANT" RELEASE_CHANNEL="${RELEASE_CHANNEL:-pre}" bash /ins/compute_build_version.sh /git/agent-zero)
echo "Build version computed: $BUILD_VERSION"
echo "$BUILD_VERSION" > /tmp/A0_BUILD_VERSION.txt

. "/ins/setup_venv.sh" "$@"

echo "Validating critical dependencies..."
bash /ins/validate_dependencies.sh /git/agent-zero

# Install A0 python packages (use uv for speed, matching upstream approach).
uv pip install -r /git/agent-zero/requirements.txt
uv pip install -r /git/agent-zero/requirements2.txt

python -c "import fastmcp; print('Verified fastmcp', fastmcp.__version__)"

bash /ins/install_playwright.sh "$@"

python /git/agent-zero/preload.py --dockerized=true

if [ -f /tmp/A0_BUILD_VERSION.txt ]; then
    export A0_BUILD_VERSION=$(cat /tmp/A0_BUILD_VERSION.txt)
    echo "A0_BUILD_VERSION set to: $A0_BUILD_VERSION"
fi
