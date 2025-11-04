#!/usr/bin/env python3
"""Create a GitHub pre-release using the GitHub API."""
import os
import sys
import json
import requests

def create_release():
    """Create a GitHub pre-release."""
    owner = "Omni-NexusAI"
    repo = "agent-zero"
    tag = "v0.9.7-custom"
    
    # Try to get token from environment
    token = os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN")
    
    if not token:
        print("Error: GITHUB_TOKEN or GH_TOKEN environment variable not set")
        print("\nTo create the release, you need a GitHub personal access token.")
        print("Set it as an environment variable:")
        print("  export GITHUB_TOKEN=your_token_here")
        print("\nOr create the release manually at:")
        print(f"  https://github.com/{owner}/{repo}/releases/new")
        return 1
    
    url = f"https://api.github.com/repos/{owner}/{repo}/releases"
    
    description = """Development build with fastmcp enforcement and validated features.

## Features Included:
- ✅ Model picker latest UI (dropdown with click-outside, staged history)
- ✅ MCP toggle panel (enable/disable toggles and status feed)
- ✅ Kokoro enhanced settings (compute/device, primary/blend voice controls)
- ✅ fastmcp==2.3.0 compatibility (prevents Pydantic TypeError)

## Build Information:
- Version ID: dev-D-0.9.7-custom
- Display Version: Version D 0.9.7-custom 2025-11-04 18:06:16
- Commit SHA: 454ca5ced929b0356acc01fef68fa654e38375a3

## Quick Start:
```bash
git clone -b v0.9.7-custom --depth 1 https://github.com/Omni-NexusAI/agent-zero.git
cd agent-zero
docker compose -f docker/run/docker-compose.yml build --no-cache
docker compose -f docker/run/docker-compose.yml up -d
```

See [SETUP.md](SETUP.md) for complete instructions."""
    
    payload = {
        "tag_name": tag,
        "name": tag,
        "body": description,
        "prerelease": True
    }
    
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        
        result = response.json()
        print(f"✅ Successfully created pre-release!")
        print(f"   Release URL: {result['html_url']}")
        print(f"   Tag: {result['tag_name']}")
        print(f"   Pre-release: {result['prerelease']}")
        return 0
        
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 422:
            print("⚠️  Release might already exist. Checking...")
            # Try to get existing release
            get_url = f"https://api.github.com/repos/{owner}/{repo}/releases/tags/{tag}"
            try:
                get_response = requests.get(get_url, headers=headers)
                if get_response.status_code == 200:
                    existing = get_response.json()
                    print(f"✅ Release already exists: {existing['html_url']}")
                    return 0
            except:
                pass
        print(f"❌ Error creating release: {e}")
        print(f"   Status: {e.response.status_code}")
        print(f"   Response: {e.response.text}")
        return 1
    except Exception as e:
        print(f"❌ Error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(create_release())

