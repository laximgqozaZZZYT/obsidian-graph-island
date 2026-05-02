#!/usr/bin/env bash
# Guardian Hook — blocks policy violations on source file edits
# Violations: threshold relaxation, hardcoded magic numbers, bypassing RenderThresholds
#
# Runs as PostToolUse hook for Edit/Write on src/**/*.ts files

set -uo pipefail

# Claude Code passes the hook payload as JSON on stdin. Read it once, then
# extract file_path / new_string. Fall back to env var if present.
TOOL_INPUT_JSON="${TOOL_INPUT:-}"
if [[ -z "$TOOL_INPUT_JSON" ]] && [[ ! -t 0 ]]; then
  TOOL_INPUT_JSON=$(cat || true)
fi

# Only check source files
FILE_PATH="${TOOL_INPUT_FILE_PATH:-}"
if [[ -z "$FILE_PATH" && -n "$TOOL_INPUT_JSON" ]]; then
  FILE_PATH=$(echo "$TOOL_INPUT_JSON" \
    | grep -oP '"file_path"\s*:\s*"([^"]+)"' \
    | head -1 | sed 's/.*"file_path"\s*:\s*"//;s/"$//' || true)
fi

# Skip non-source files
if [[ ! "$FILE_PATH" =~ ^.*/src/.*\.ts$ ]]; then
  exit 0
fi

ERRORS=()

# Check the new content being written/edited
CONTENT="${TOOL_INPUT_NEW_STRING:-${TOOL_INPUT_CONTENT:-}}"

if [[ -z "$CONTENT" && -n "$TOOL_INPUT_JSON" ]]; then
  CONTENT=$(echo "$TOOL_INPUT_JSON" \
    | grep -oP '"new_string"\s*:\s*"([^"]*)"' \
    | head -1 | sed 's/.*"new_string"\s*:\s*"//;s/"$//' || true)
  if [[ -z "$CONTENT" ]]; then
    CONTENT=$(echo "$TOOL_INPUT_JSON" \
      | grep -oP '"content"\s*:\s*"([^"]*)"' \
      | head -1 | sed 's/.*"content"\s*:\s*"//;s/"$//' || true)
  fi
fi

if [[ -z "$CONTENT" ]]; then
  exit 0
fi

# 1. Detect hardcoded magic numbers in render/layout logic
#    (numbers directly in conditionals/assignments, not from thresholds/settings)
if echo "$CONTENT" | grep -qP '(?<!thresholds\.)(?<!settings\.)(?<!DEFAULT_)\b(FAIL|WARN|threshold|limit)\s*[=:]\s*\d+\.?\d*\b' 2>/dev/null; then
  # Only flag if it's NOT referencing thresholds object
  if ! echo "$CONTENT" | grep -qP 'thresholds\.' 2>/dev/null; then
    ERRORS+=("GUARDIAN: Possible hardcoded threshold detected. Use RenderThresholds instead.")
  fi
fi

# 2. Detect threshold relaxation patterns
#    (increasing FAIL thresholds, decreasing sensitivity)
if echo "$CONTENT" | grep -qiP '(AP\d+_FAIL|FAIL_THRESHOLD)\s*=\s*[0-9]' 2>/dev/null; then
  ERRORS+=("GUARDIAN WARNING: AP threshold constant being modified. Verify this is NOT a relaxation.")
fi

# 3. Detect bypassing existing settings with inline values
if echo "$CONTENT" | grep -qP '\b(fontSize|nodeSize|edgeAlpha|labelScale|minViewportUtilization)\s*[=:]\s*\d+\.?\d*\b' 2>/dev/null; then
  if ! echo "$CONTENT" | grep -qP '(this\.thresholds|settings\.|RenderThresholds|DEFAULT_RENDER)' 2>/dev/null; then
    ERRORS+=("GUARDIAN: Inline numeric assignment to a configurable property. Should this use RenderThresholds/settings?")
  fi
fi

# 4. Detect god object growth (check file line count after edit)
# 2026-04-26 Phase E1 ratchet re-baseline; kept in sync with CLAUDE.md.
# Phase R5 (2026-05-02): pull from CLAUDE.md (single source of truth).
CLAUDE_MD="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/CLAUDE.md"
declare -A GOD_LIMITS=()
if [[ -f "$CLAUDE_MD" ]]; then
  while IFS= read -r line; do
    if [[ "$line" =~ \`src/views/([A-Za-z]+\.ts)\`[[:space:]]*\|[[:space:]]*[0-9]+[[:space:]]*\|[[:space:]]*([0-9]+) ]]; then
      GOD_LIMITS["${BASH_REMATCH[1]}"]="${BASH_REMATCH[2]}"
    fi
  done < "$CLAUDE_MD"
fi
if [[ ${#GOD_LIMITS[@]} -eq 0 ]]; then
  GOD_LIMITS=(
    ["GraphViewContainer.ts"]=8655
    ["PanelBuilder.ts"]=2216
    ["RenderPipeline.ts"]=2476
    ["EdgeRenderer.ts"]=2702
  )
fi
BASENAME=$(basename "$FILE_PATH")
if [[ -v "GOD_LIMITS[$BASENAME]" && -f "$FILE_PATH" ]]; then
  CURRENT=$(wc -l < "$FILE_PATH")
  LIMIT=${GOD_LIMITS[$BASENAME]}
  if [[ $CURRENT -gt $LIMIT ]]; then
    ERRORS+=("GUARDIAN: God object $BASENAME grew to ${CURRENT} lines (limit: ${LIMIT}). Extract logic instead of appending.")
  fi
fi

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo "============================================"
  echo "  GUARDIAN POLICY CHECK — VIOLATIONS FOUND"
  echo "============================================"
  for err in "${ERRORS[@]}"; do
    echo "  ⚠ $err"
  done
  echo ""
  echo "  File: $FILE_PATH"
  echo "  Policy: No hardcoding, no threshold relaxation,"
  echo "          all values via RenderThresholds/settings."
  echo "============================================"
  # Exit 0 with warnings (non-blocking) — change to exit 1 to block
  exit 0
fi

exit 0
