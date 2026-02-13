#!/usr/bin/bash
# Root directory (defaults to current directory if not provided)
TARGET_DIR=${1:-.}

# Exclude pattern (regex) — adjust as needed
EXCLUDE_REGEX="node_modules|dist|build|.git|.tanstack|.vscode|.next|coverage|.turbo|out|storybook-static|dev-dist|.output|.nitro"

# Output format (cli-table / simple / csv / json)
OUTPUT_FORMAT="cli-table"

# Run sloc with exclusions
sloc \
  --exclude "$EXCLUDE_REGEX" \
  --format "$OUTPUT_FORMAT" \
  "$TARGET_DIR"
