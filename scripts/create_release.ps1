$description = @"
Development build with fastmcp enforcement and validated features.

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
``````bash
git clone -b v0.9.7-custom --depth 1 https://github.com/Omni-NexusAI/agent-zero.git
cd agent-zero
docker compose -f docker/run/docker-compose.yml build --no-cache
docker compose -f docker/run/docker-compose.yml up -d
``````

See [SETUP.md](SETUP.md) for complete instructions.
"@

$body = @{
    tag_name = 'v0.9.7-custom'
    name = 'v0.9.7-custom'
    body = $description
    prerelease = $true
} | ConvertTo-Json -Depth 10

$headers = @{
    'Accept' = 'application/vnd.github.v3+json'
    'Content-Type' = 'application/json'
}

# Try to get token from environment or GitHub CLI config
$token = $env:GITHUB_TOKEN
if (-not $token) {
    $ghConfigPath = "$env:USERPROFILE\.config\gh\hosts.yml"
    if (Test-Path $ghConfigPath) {
        # Try to extract token (this is a simplified approach)
        Write-Host "GitHub CLI config found, but token extraction not implemented"
        Write-Host "Please set GITHUB_TOKEN environment variable or use GitHub web interface"
        exit 1
    }
}

if ($token) {
    $headers['Authorization'] = "token $token"
    $uri = 'https://api.github.com/repos/Omni-NexusAI/agent-zero/releases'
    
    try {
        $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $body
        Write-Host "Successfully created pre-release: $($response.html_url)"
        Write-Host "Release ID: $($response.id)"
        Write-Host "Tag: $($response.tag_name)"
    } catch {
        Write-Host "Error creating release: $($_.Exception.Message)"
        Write-Host "Response: $($_.Exception.Response)"
        exit 1
    }
} else {
    Write-Host "GitHub token not found. Please create release manually:"
    Write-Host "1. Go to: https://github.com/Omni-NexusAI/agent-zero/releases/new"
    Write-Host "2. Select tag: v0.9.7-custom"
    Write-Host "3. Set as pre-release"
    Write-Host "4. Use the description above"
}





