#!/bin/bash
set -e

# Exit immediately if a command exits with a non-zero status.
# set -e

# branch from parameter
if [ -z "$1" ]; then
    echo "Error: Branch parameter is empty. Please provide a valid branch name."
    exit 1
fi
BRANCH="$1"

if [ "$BRANCH" = "local" ]; then
    # For local branch, use the files
    echo "Using local dev files in /git/agent-zero"
    # List all files recursively in the target directory
    # echo "All files in /git/agent-zero (recursive):"
    # find "/git/agent-zero" -type f | sort
else
    # For other branches, clone from GitHub
    echo "Cloning repository from branch $BRANCH..."
    git clone -b "$BRANCH" "https://github.com/agent0ai/agent-zero" "/git/agent-zero" || {
        echo "CRITICAL ERROR: Failed to clone repository. Branch: $BRANCH"
        exit 1
    }
fi

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
