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

# Ensure tooling compatibility (whisper build on Python 3.13)
pip install "setuptools<81" wheel

# Validate and fix critical dependencies (e.g., fastmcp==2.3.0)
echo "Validating critical dependencies..."
bash /ins/validate_dependencies.sh /git/agent-zero

# Patch whisper requirement for py3.11 compatibility
sed -i 's/openai-whisper==20240930/openai-whisper==20231117/' /git/agent-zero/requirements.txt

# Install dependencies with a whisper constraint for py3.13
echo "openai-whisper==20231117" > /tmp/constraints.txt
pip install -r /git/agent-zero/requirements.txt -c /tmp/constraints.txt
# Ensure key deps present
pip install "litellm==1.75.0" "aiohttp==3.10.5"

# install playwright
bash /ins/install_playwright.sh "$@"

# Preload A0
python /git/agent-zero/preload.py --dockerized=true
