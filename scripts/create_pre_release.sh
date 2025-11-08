#!/bin/bash
# Script to create a GitHub pre-release from a tag
# Usage: ./scripts/create_pre_release.sh <tag-name> [description]

set -e

TAG_NAME="${1:-}"
DESCRIPTION="${2:-Development build with validated features and fastmcp enforcement}"

if [ -z "$TAG_NAME" ]; then
    echo "Usage: $0 <tag-name> [description]"
    echo "Example: $0 v0.9.7-custom 'Development build with fastmcp enforcement'"
    exit 1
fi

# Get repository info
REPO_OWNER="Omni-NexusAI"
REPO_NAME="agent-zero"
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}"

# Check if tag exists locally
if ! git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
    echo "Error: Tag '$TAG_NAME' not found locally"
    echo "Create tag first with: git tag -a $TAG_NAME -m 'Your message'"
    exit 1
fi

# Check if tag exists on remote
if git ls-remote --tags origin | grep -q "refs/tags/$TAG_NAME"; then
    echo "Tag '$TAG_NAME' exists on remote"
else
    echo "Tag '$TAG_NAME' not found on remote. Pushing tag..."
    git push origin "$TAG_NAME"
fi

# Get tag commit SHA
TAG_SHA=$(git rev-parse "$TAG_NAME")
SHORT_SHA=$(git rev-parse --short "$TAG_SHA")

echo ""
echo "Creating GitHub pre-release for tag: $TAG_NAME"
echo "Commit SHA: $TAG_SHA"
echo ""
echo "To create the pre-release, use one of these methods:"
echo ""
echo "Method 1: GitHub CLI (if installed)"
echo "  gh release create $TAG_NAME --prerelease --title '$TAG_NAME' --notes '$DESCRIPTION'"
echo ""
echo "Method 2: GitHub Web Interface"
echo "  1. Go to: $REPO_URL/releases/new"
echo "  2. Select tag: $TAG_NAME"
echo "  3. Set title: $TAG_NAME"
echo "  4. Add description: $DESCRIPTION"
echo "  5. Check 'Set as a pre-release'"
echo "  6. Click 'Publish release'"
echo ""
echo "Method 3: GitHub API (with GitHub token)"
echo "  curl -X POST https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/releases \\"
echo "    -H 'Authorization: token YOUR_GITHUB_TOKEN' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{"
echo "      \"tag_name\": \"$TAG_NAME\","
echo "      \"name\": \"$TAG_NAME\","
echo "      \"body\": \"$DESCRIPTION\","
echo "      \"prerelease\": true"
echo "    }'"
echo ""
echo "After creating the release, agents can pull it with:"
echo "  git clone -b $TAG_NAME --depth 1 $REPO_URL.git"





