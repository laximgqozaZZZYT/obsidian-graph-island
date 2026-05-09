#!/usr/bin/env bash
# PreToolUse Hook — warns when editing god object files that are at their line limit
# Triggers on Edit/Write for src/**/*.ts files

set -uo pipefail

# Claude Code passes the hook payload as JSON on stdin. Read it once, then
# extract file_path. Fall back to env var if present (older convention).
TOOL_INPUT_JSON="${TOOL_INPUT:-}"
if [[ -z "$TOOL_INPUT_JSON" ]] && [[ ! -t 0 ]]; then
  TOOL_INPUT_JSON=$(cat || true)
fi

FILE_PATH="${TOOL_INPUT_FILE_PATH:-}"
if [[ -z "$FILE_PATH" && -n "$TOOL_INPUT_JSON" ]]; then
  FILE_PATH=$(echo "$TOOL_INPUT_JSON" \
    | grep -oP '"file_path"\s*:\s*"([^"]+)"' \
    | head -1 | sed 's/.*"file_path"\s*:\s*"//;s/"$//' || true)
fi

# Phase R7 (2026-05-03): block edits to CLAUDE.md from autonomous cycles.
# Phase E1/E2 history showed CLAUDE.md being silently raised when format
# reflow pushed god-object files past their limit. Now CLAUDE.md is the
# single source of truth (R5 dynamic parse) — letting autonomous edit it
# would re-open the same drift loop. Human PRs (this session) bypass the
# hook because they go through Edit/Write tools the operator approves.
#
# Hooks fail-closed: emit a clear "blocked" message and exit non-zero so
# the model sees the rejection and corrects course.
if [[ "$FILE_PATH" == */CLAUDE.md ]]; then
  cat >&2 <<'BLOCKED'
============================================
  PRE-EDIT GUARD — CLAUDE.md is protected
============================================
  Reason: CLAUDE.md is the single source of truth for god-object
  ratchets and pipeline rules. Autonomous cycles must NOT raise the
  Max Allowed limits or relax the Forbidden Patterns. If a god-object
  is over-cap, extract code into a new file instead.
============================================
BLOCKED
  exit 1
fi

# 2026-05-08 kaizen: protect pipeline scripts from autonomous self-modification.
# scripts/pipeline/*.{sh,py,mjs} drive the autonomous loop; edits from auto-improve-*
# branches caused the 2026-05-02 csv-helpers PR pollution incident. Branch-name
# detection isolates autonomous sessions from human kaizen sessions on main.
# Fail-open on unknown branch (false-positive avoidance for non-git contexts).
if [[ "$FILE_PATH" =~ scripts/pipeline/.+\.(sh|py|mjs)$ ]]; then
  current_branch=$(git -C "$(dirname "$FILE_PATH")" rev-parse --abbrev-ref HEAD 2>/dev/null \
                   || git rev-parse --abbrev-ref HEAD 2>/dev/null \
                   || echo unknown)
  if [[ "$current_branch" =~ ^auto-(improve|fix)- ]]; then
    cat >&2 <<BLOCKED
============================================
  PRE-EDIT GUARD — pipeline self-modification blocked
============================================
  File: $FILE_PATH
  Branch: $current_branch
  Reason: scripts/pipeline/*.{sh,py,mjs} are pipeline drivers. Autonomous
  sessions on auto-improve-* / auto-fix-* branches must not modify their
  own runtime — see csv-helpers PR pollution incident (2026-05-02).
  Recovery: file an issue describing the change, let a human review on main.
============================================
BLOCKED
    exit 1
  fi
fi

# Skip non-source files
if [[ ! "$FILE_PATH" =~ ^.*/src/.*\.ts$ ]]; then
  exit 0
fi

# God object limits — kept in sync with CLAUDE.md "Max Allowed" column.
# 2026-04-26 Phase E1 ratchet re-baseline values.
# Phase R5 (2026-05-02): pull GOD_LIMITS dynamically from CLAUDE.md instead
# of hardcoding here. Previously the values had to be kept in sync with the
# `Max Allowed` table by hand, and Phase E2 drift was caused by exactly this
# divergence. Now the table in CLAUDE.md is the single source of truth.
CLAUDE_MD="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/CLAUDE.md"
declare -A GOD_LIMITS=()
if [[ -f "$CLAUDE_MD" ]]; then
  while IFS= read -r line; do
    # Match table rows like:  | `src/views/GraphViewContainer.ts` | 8655 | 8655 | ...
    if [[ "$line" =~ \`src/views/([A-Za-z]+\.ts)\`[[:space:]]*\|[[:space:]]*[0-9]+[[:space:]]*\|[[:space:]]*([0-9]+) ]]; then
      GOD_LIMITS["${BASH_REMATCH[1]}"]="${BASH_REMATCH[2]}"
    fi
  done < "$CLAUDE_MD"
fi
# Fallback if CLAUDE.md parse fails (defensive — keep previous hard-coded values).
if [[ ${#GOD_LIMITS[@]} -eq 0 ]]; then
  GOD_LIMITS=(
    ["GraphViewContainer.ts"]=8655
    ["PanelBuilder.ts"]=2216
    ["RenderPipeline.ts"]=2476
    ["EdgeRenderer.ts"]=2702
  )
fi

BASENAME=$(basename "$FILE_PATH")

if [[ -v "GOD_LIMITS[$BASENAME]" ]]; then
  LIMIT=${GOD_LIMITS[$BASENAME]}
  if [[ -f "$FILE_PATH" ]]; then
    CURRENT=$(wc -l < "$FILE_PATH")
    if [[ $CURRENT -ge $LIMIT ]]; then
      echo "============================================"
      echo "  GOD OBJECT GUARD — SIZE WARNING"
      echo "============================================"
      echo "  File: $BASENAME"
      echo "  Current: ${CURRENT} lines (limit: ${LIMIT})"
      echo "  Policy: Do NOT grow god objects."
      echo "  Extract logic into a new file instead."
      echo "============================================"
      # Non-blocking warning (exit 0) — change to exit 1 to block
      exit 0
    fi
  fi
fi

exit 0
