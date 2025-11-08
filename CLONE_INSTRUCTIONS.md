# Quick Reference: Cloning Agent Zero Development Builds

## ⚠️ CRITICAL INFORMATION

**Pre-release tags ONLY exist in `Omni-NexusAI/agent-zero` repository.**  
**DO NOT use `agent0ai/agent-zero`** - tags don't exist there!

## Correct Commands

### For Pre-Release Tag:
```bash
git clone -b v0.9.7-custom --depth 1 https://github.com/Omni-NexusAI/agent-zero.git
```

### For Development Branch:
```bash
git clone -b development https://github.com/Omni-NexusAI/agent-zero.git
```

## Wrong Commands (Will NOT Work)

❌ **DO NOT USE:**
```bash
git clone -b v0.9.7-custom https://github.com/agent0ai/agent-zero.git  # Tags don't exist here!
git clone -b dev https://github.com/Omni-NexusAI/agent-zero.git        # Branch is 'development' not 'dev'
git clone -b main https://github.com/Omni-NexusAI/agent-zero.git       # Wrong branch
```

## Key Points

1. **Repository**: `Omni-NexusAI/agent-zero` (NOT `agent0ai/agent-zero`)
2. **Branch**: `development` (NOT `dev` or `main`)
3. **Tags**: Only exist in `Omni-NexusAI/agent-zero`
4. **Current Pre-Release**: `v0.9.7-custom`

## Verification

After cloning, verify you have the right version:
```bash
git describe --tags  # Should show: v0.9.7-custom
git remote -v        # Should show: Omni-NexusAI/agent-zero
git branch           # Should show: * (HEAD detached at v0.9.7-custom) or development
```





