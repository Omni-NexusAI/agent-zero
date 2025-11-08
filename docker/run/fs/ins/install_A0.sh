#!/bin/bash
set -e

# Exit immediately if a command exits with a non-zero status.
# set -e

# GIT_REF from parameter (can be branch name or tag)
if [ -z "$1" ]; then
    echo "Error: GIT_REF parameter is empty. Please provide a valid branch name or tag."
    exit 1
fi
GIT_REF="$1"

# Detect if GIT_REF is a tag (starts with 'v' followed by numbers, or contains version pattern)
IS_TAG=false
if [[ "$GIT_REF" =~ ^v[0-9] ]] || [[ "$GIT_REF" =~ -custom$ ]] || [[ "$GIT_REF" =~ ^v[0-9]+\.[0-9] ]]; then
    IS_TAG=true
fi

if [ "$GIT_REF" = "local" ]; then
    # For local branch, use the files
    echo "Using local dev files in /git/agent-zero"
    # List all files recursively in the target directory
    # echo "All files in /git/agent-zero (recursive):"
    # find "/git/agent-zero" -type f | sort
elif [ "$GIT_REF" = "development" ] || [ "$IS_TAG" = true ]; then
    # For development branch OR tags, use Omni-NexusAI fork (contains validated features and fixes)
    if [ "$IS_TAG" = true ]; then
        echo "Cloning tag $GIT_REF from Omni-NexusAI repository..."
        git clone --branch "$GIT_REF" "https://github.com/Omni-NexusAI/agent-zero" "/git/agent-zero" || {
            echo "CRITICAL ERROR: Failed to clone tag. Tag: $GIT_REF from Omni-NexusAI"
            exit 1
        }
    else
        echo "Cloning development branch from Omni-NexusAI repository..."
        git clone -b "$GIT_REF" "https://github.com/Omni-NexusAI/agent-zero" "/git/agent-zero" || {
            echo "CRITICAL ERROR: Failed to clone repository. Branch: $GIT_REF from Omni-NexusAI"
            exit 1
        }
    fi
else
    # For other branches, clone from main agent0ai repository
    echo "Cloning repository from branch $GIT_REF..."
    git clone -b "$GIT_REF" "https://github.com/agent0ai/agent-zero" "/git/agent-zero" || {
        echo "CRITICAL ERROR: Failed to clone repository. Branch: $GIT_REF"
        exit 1
    }
fi

# Compute build version from git repository
echo "Computing build version from git repository..."
BUILD_VERSION=$(bash /ins/compute_build_version.sh /git/agent-zero)
echo "Build version computed: $BUILD_VERSION"
# Store in file for later use in Docker build
echo "$BUILD_VERSION" > /tmp/A0_BUILD_VERSION.txt

. "/ins/setup_venv.sh" "$@"

# Validate and fix critical dependencies (e.g., fastmcp==2.3.0)
echo "Validating critical dependencies..."
bash /ins/validate_dependencies.sh /git/agent-zero

# moved to base image
# # Ensure the virtual environment and pip setup
# pip install --upgrade pip ipython requests
# # Install some packages in specific variants
# pip install torch --index-url https://download.pytorch.org/whl/cpu

# Install remaining A0 python packages
uv pip install -r /git/agent-zero/requirements.txt

# Safety check: explicitly ensure fastmcp==2.3.0 is installed (overrides if wrong version was installed)
echo "Ensuring fastmcp==2.3.0 is correctly installed..."
uv pip install --force-reinstall --no-cache-dir "fastmcp==2.3.0" || {
    echo "ERROR: Failed to install fastmcp==2.3.0"
    exit 1
}

# Verify fastmcp version
INSTALLED_VERSION=$(python -c "import fastmcp; print(fastmcp.__version__)" 2>/dev/null || echo "not found")
if [ "$INSTALLED_VERSION" != "2.3.0" ]; then
    echo "ERROR: fastmcp version mismatch. Expected: 2.3.0, Got: $INSTALLED_VERSION"
    exit 1
fi
echo "✓ Verified fastmcp==2.3.0 is installed"

# install playwright
bash /ins/install_playwright.sh "$@"

# Preload A0
python /git/agent-zero/preload.py --dockerized=true

# Export build version for runtime
if [ -f /tmp/A0_BUILD_VERSION.txt ]; then
    export A0_BUILD_VERSION=$(cat /tmp/A0_BUILD_VERSION.txt)
    echo "A0_BUILD_VERSION set to: $A0_BUILD_VERSION"
fi
