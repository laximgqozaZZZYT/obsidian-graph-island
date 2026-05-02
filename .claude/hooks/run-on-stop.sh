#!/usr/bin/env bash
# Hook: Stop — run unit tests, then build+deploy+E2E (with CDP pre-check)
# Output: JSON with additionalContext for Claude to read results
set -o pipefail
cd /home/ubuntu/obsidian-plugins/obsidian-graph-island

RESULTS=""
EXIT=0

# ============================================================
# Phase 0: Lint check (ESLint — errors only)
# ============================================================
LINT_OUT=$(npx eslint src/ --quiet 2>&1)
LINT_EXIT=$?
LINT_SUMMARY=$(echo "$LINT_OUT" | grep -cE '^\s' || echo "0")
if [[ $LINT_EXIT -ne 0 ]]; then
  LINT_ERRORS=$(echo "$LINT_OUT" | grep -E 'error' | head -10 | sed 's/\x1b\[[0-9;]*m//g')
  RESULTS="[LINT] FAILED — ${LINT_SUMMARY} error(s)\n${LINT_ERRORS}"
  EXIT=1
else
  RESULTS="[LINT] OK (0 errors)"
fi

# ============================================================
# Phase 1: Unit tests (vitest)
# ============================================================
UNIT_OUT=$(npx vitest run 2>&1)
UNIT_EXIT=$?
UNIT_SUMMARY=$(echo "$UNIT_OUT" | grep -E 'Test Files|Tests ' | tr '\n' ' ' | sed 's/\x1b\[[0-9;]*m//g')
UNIT_FAILURES=$(echo "$UNIT_OUT" | grep -E 'FAIL ' | head -10 | sed 's/\x1b\[[0-9;]*m//g')

RESULTS="[UNIT] ${UNIT_SUMMARY}"
if [[ -n "$UNIT_FAILURES" ]]; then
  RESULTS="${RESULTS}\n[UNIT FAILURES]\n${UNIT_FAILURES}"
fi

if [[ $UNIT_EXIT -ne 0 ]]; then
  EXIT=1
  RESULTS="${RESULTS}\n\n[E2E] SKIPPED — unit tests failed, fix them first."
  echo -e "$RESULTS"
  exit $EXIT
fi

# ============================================================
# Phase 2: CDP connection check (required for E2E)
# ============================================================
CDP_PORT=9222
CDP_CHECK=$(curl -sf "http://localhost:${CDP_PORT}/json/version" 2>/dev/null)
if [[ -z "$CDP_CHECK" ]]; then
  RESULTS="${RESULTS}\n\n[E2E] SKIPPED — CDP not available on port ${CDP_PORT}. Start Obsidian with --remote-debugging-port=${CDP_PORT}"
  echo -e "$RESULTS"
  exit 0
fi

# ============================================================
# Phase 3: Build + Deploy (required before E2E)
# ============================================================
BUILD_OUT=$(npm run build 2>&1)
BUILD_EXIT=$?
if [[ $BUILD_EXIT -ne 0 ]]; then
  BUILD_ERR=$(echo "$BUILD_OUT" | tail -20 | sed 's/\x1b\[[0-9;]*m//g')
  RESULTS="${RESULTS}\n\n[BUILD] FAILED\n${BUILD_ERR}\n[E2E] SKIPPED — build failed."
  EXIT=1
  echo -e "$RESULTS"
  exit $EXIT
fi

# Detect vault basePath via CDP and deploy
VAULT_BASE=$(curl -sf "http://localhost:${CDP_PORT}/json" 2>/dev/null \
  | python3 -c "
import sys, json
tabs = json.load(sys.stdin)
for t in tabs:
  if 'obsidian' in t.get('url','').lower() or 'index.html' in t.get('url',''):
    print(t.get('webSocketDebuggerUrl',''))
    break
" 2>/dev/null || true)

# Deploy to both known locations
cp main.js "/home/ubuntu/obsidian-plugins/開発/.obsidian/plugins/graph-island/main.js" 2>/dev/null
cp main.js "/home/ubuntu/obsidian-plugins/.obsidian/plugins/graph-island/main.js" 2>/dev/null
RESULTS="${RESULTS}\n[BUILD] OK — deployed to vault(s)"

# ============================================================
# Phase 4: E2E tests (Playwright CDP)
# ============================================================
E2E_OUT=$(npx playwright test --config e2e/cdp-smoke.config.ts --reporter=line 2>&1)
E2E_EXIT=$?
E2E_SUMMARY=$(echo "$E2E_OUT" | grep -E '[0-9]+ (passed|failed|did not run)' | tail -3 | sed 's/\x1b\[[0-9;]*m//g')
E2E_FAILURES=$(echo "$E2E_OUT" | grep -E '^\s+(✘|×|FAIL|failed)' | head -20 | sed 's/\x1b\[[0-9;]*m//g')

if [[ $E2E_EXIT -ne 0 ]]; then EXIT=1; fi
RESULTS="${RESULTS}\n[E2E] ${E2E_SUMMARY}"
if [[ -n "$E2E_FAILURES" ]]; then
  RESULTS="${RESULTS}\n[E2E FAILURES]\n${E2E_FAILURES}"
fi

# ============================================================
# Phase 5: Bundle size check
# ============================================================
BUNDLE_BUDGET=819200  # 800KB
if [[ -f main.js ]]; then
  BUNDLE_SIZE=$(stat -c%s main.js 2>/dev/null || echo 0)
  if [[ $BUNDLE_SIZE -gt $BUNDLE_BUDGET ]]; then
    RESULTS="${RESULTS}\n[BUNDLE] OVER BUDGET — ${BUNDLE_SIZE} bytes (budget: ${BUNDLE_BUDGET})"
    EXIT=1
  else
    RESULTS="${RESULTS}\n[BUNDLE] OK — ${BUNDLE_SIZE} bytes (budget: ${BUNDLE_BUDGET})"
  fi
fi

# ============================================================
# Output as plain stdout. Stop hooks do not accept hookSpecificOutput
# (that schema is for PreToolUse / PostToolUse). Emitting JSON with
# `hookSpecificOutput` triggered Claude Code's "Hook JSON output
# validation failed" non-blocking error on every stop. (2026-04-26 fix.)
# ============================================================
echo -e "$RESULTS"
exit $EXIT
