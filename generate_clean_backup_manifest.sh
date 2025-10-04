#!/bin/bash

# Clean backup manifest generator
# Excludes development dependencies and caches while preserving essential data

# Configuration
MANIFEST_FILE="/root/backup_scripts/dynamic_backup/manifest_clean.txt"
BACKUP_BASE_DIRS=("/a0" "/root")

# Directories to completely exclude
EXCLUDE_DIRS=(
    "node_modules"
    "site-packages"
    "__pycache__"
    "*.pyc"
    "*.pyo"
    "*.pyd"
    ".cache"
    ".npm"
    ".uv"
    "venv"
    "env"
    ".git"
    ".vscode"
    ".idea"
    "build"
    "dist"
    "*.egg-info"
    "*.dist-info"
)

# Files to exclude
EXCLUDE_FILES=(
    "*.log"
    "*.tmp"
    "*.temp"
    "*.cache"
    "*.swp"
    "*.swo"
    "*~"
    ".DS_Store"
    "Thumbs.db"
)

# Essential directories to always include
ESSENTIAL_DIRS=(
    "/a0/memory"
    "/a0/logs"
    "/a0/tmp"
    "/a0/conf"
    "/a0/knowledge"
    "/root/.config/syncthing"
    "/root/.local/share/syncthing"
    "/root/.local/share/knowledge_graph"
    "/root/.config/knowledge_graph"
    "/root/backup_scripts"
)

# Essential files to always include
ESSENTIAL_FILES=(
    "/a0/tmp/settings.json"
    "/a0/.env"
    "/a0/.dockerignore"
    "/a0/.gitattributes"
    "/root/backup_scripts/last_backup_timestamp"
)

# Function to check if path should be excluded
should_exclude() {
    local path="$1"
    
    # Check exclude directories
    for exclude_dir in "${EXCLUDE_DIRS[@]}"; do
        if [[ "$path" == *"$exclude_dir"* ]]; then
            return 0
        fi
    done
    
    # Check exclude files
    for exclude_file in "${EXCLUDE_FILES[@]}"; do
        if [[ "$path" == *"$exclude_file" ]]; then
            return 0
        fi
    done
    
    return 1
}

# Function to check if path is essential
is_essential() {
    local path="$1"
    
    # Check essential directories
    for essential_dir in "${ESSENTIAL_DIRS[@]}"; do
        if [[ "$path" == "$essential_dir"* ]]; then
            return 0
        fi
    done
    
    # Check essential files
    for essential_file in "${ESSENTIAL_FILES[@]}"; do
        if [[ "$path" == "$essential_file" ]]; then
            return 0
        fi
    done
    
    return 1
}

# Generate clean manifest
echo "🧹 Generating clean backup manifest..."

# Clear previous manifest
> "$MANIFEST_FILE"

# Track seen paths to avoid duplicates
declare -A seen_paths

# Process each base directory
for base_dir in "${BACKUP_BASE_DIRS[@]}"; do
    if [[ -d "$base_dir" ]]; then
        echo "📁 Processing directory: $base_dir"
        
        # Find all files and directories
        while IFS= read -r path; do
            if [[ -n "$path" ]]; then
                # Skip if already seen
                if [[ -n "${seen_paths[$path]}" ]]; then
                    continue
                fi
                
                # Mark as seen
                seen_paths["$path"]=1
                
                # Check if should be excluded
                if should_exclude "$path"; then
                    continue
                fi
                
                # Include if essential or if it's a configuration/data file
                if is_essential "$path" || [[ "$path" =~ \.(json|yaml|yml|toml|ini|conf|cfg|txt|md|html|css|js|py|sh)$ ]]; then
                    echo "$path" >> "$MANIFEST_FILE"
                fi
            fi
        done < <(find "$base_dir" -type f -o -type d 2>/dev/null | head -10000)
    fi
done

# Add essential paths explicitly if not already included
for essential_path in "${ESSENTIAL_DIRS[@]}" "${ESSENTIAL_FILES[@]}"; do
    if [[ -e "$essential_path" ]] && [[ -z "${seen_paths[$essential_path]}" ]]; then
        echo "$essential_path" >> "$MANIFEST_FILE"
    fi
done

echo "✅ Clean backup manifest generated: $MANIFEST_FILE"
echo "📊 Total entries: $(wc -l < "$MANIFEST_FILE")"

# Show sample of what's included
echo "\n📋 Sample included paths:"
head -10 "$MANIFEST_FILE" 2>/dev/null | sed 's/^/  /'

echo "\n🚀 Ready for backup with clean manifest!"
