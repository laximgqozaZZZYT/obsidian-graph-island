#!/usr/bin/env bash
# Regression test for R13-A iteration isolation fix (2026-05-09).
#
# Round 12 (autonomous commit cfb87d06 "chore: done 1656-1654-src-types-ts-dirty")
# observed that an autonomous task commit on PROJECT_DIR (main worktree)
# accidentally swept up operator-edited files — README.md,
# acknowledge-alert.sh, migrations/* — because the commit step used
#
#     (cd "$PROJECT_DIR" && git add scripts/pipeline/ && git commit ...)
#
# i.e. a *bare directory* `git add` that staged every dirty file under
# scripts/pipeline/ regardless of who edited it. Round 13-A narrowed the
# add-list to a whitelist:
#
#     git add scripts/pipeline/issues.csv \
#             scripts/pipeline/tasks.csv \
#             scripts/pipeline/attempts.csv \
#             scripts/pipeline/descriptions/ \
#             scripts/pipeline/reports/
#
# This test pins that whitelist in place. Source-grep only — exercising
# the commit path requires a fully bootstrapped worktree, so we instead
# verify the static contract every cron-invocation will respect.
#
# Each case below documents *what would regress* if it failed:
#
#   Case 1 — bare-dir wildcard (`git add scripts/pipeline/` on its own)
#            re-introduced ⇒ exact Round-12 incident class.
#   Case 2 — every `git add scripts/pipeline/...` line continues with an
#            allowed sub-path. Catches the subtler regression where someone
#            adds a *new* bare-dir pattern (e.g. `scripts/pipeline/lib/`).
#   Case 3 — `git add -A` calls remain inside worktree context (no
#            preceding `cd "$PROJECT_DIR"` on the same statement). `-A`
#            against PROJECT_DIR would re-create Round 12 in a different
#            shape.
#   Case 4 — every `cd "$PROJECT_DIR" && git add ...` uses a specific
#            path or `vitest.config.ts`, never `-A` or a bare dir.
#   Case 5 — the R13-A comment marker survives in source. The marker is
#            the single load-bearing string future readers grep for when
#            asking "why is this whitelisted?" — losing it costs context.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT="$REPO_ROOT/scripts/pipeline/autonomous-improve.sh"

passed=0
failed=0

if [[ ! -f "$SUT" ]]; then
  echo "FAIL: precondition: SUT not found at $SUT"
  exit 1
fi

# ─── Helpers ─────────────────────────────────────────────────────────────

# assert_zero_matches LABEL PATTERN FILE
#   Pass iff `grep -E PATTERN FILE` finds zero matches.
assert_zero_matches() {
  local label="$1" pattern="$2" file="$3"
  local count
  count=$(grep -cE "$pattern" "$file" 2>/dev/null || true)
  # grep -c exits 1 when count is 0; mask via || true above. Normalise empty.
  count="${count:-0}"
  if [[ "$count" -eq 0 ]]; then
    echo "PASS: $label (0 matches)"
    passed=$((passed + 1))
  else
    echo "FAIL: $label ($count match(es) found)"
    grep -nE "$pattern" "$file" | sed 's/^/      /'
    failed=$((failed + 1))
  fi
}

# assert_grep_in LABEL PATTERN FILE
#   Pass iff `grep -E PATTERN FILE` finds ≥1 match.
assert_grep_in() {
  local label="$1" pattern="$2" file="$3"
  if grep -qE "$pattern" "$file" 2>/dev/null; then
    echo "PASS: $label"
    passed=$((passed + 1))
  else
    echo "FAIL: $label (pattern not found: $pattern)"
    failed=$((failed + 1))
  fi
}

# assert_pass LABEL — record a manual PASS (used by per-line case 2 loop).
assert_pass() {
  echo "PASS: $1"
  passed=$((passed + 1))
}

# assert_fail LABEL — record a manual FAIL.
assert_fail() {
  echo "FAIL: $1"
  failed=$((failed + 1))
}

# ─── Case 1: bare-dir wildcard never used ────────────────────────────────
# Pattern matches `git add scripts/pipeline/` followed by space, &, |, ;
# or end-of-line — i.e. the directory is the entire path argument. It
# does NOT match `git add scripts/pipeline/issues.csv` (path continues
# with a token character). One regex per terminator so the alternation
# stays POSIX-ERE friendly.
assert_zero_matches \
  "case1a: no 'git add scripts/pipeline/<EOL>'" \
  'git add scripts/pipeline/$' \
  "$SUT"

assert_zero_matches \
  "case1b: no 'git add scripts/pipeline/ ' (trailing space)" \
  'git add scripts/pipeline/[[:space:]]' \
  "$SUT"

assert_zero_matches \
  "case1c: no 'git add scripts/pipeline/[&|;]' (shell control)" \
  'git add scripts/pipeline/[&|;]' \
  "$SUT"

# ─── Case 2: every `git add scripts/pipeline/X` line uses an allowed X ──
# Allowed sub-paths under scripts/pipeline/ for autonomous-task commits.
# Anything else is a regression candidate — fail loudly.
allowed_re='scripts/pipeline/(issues\.csv|tasks\.csv|attempts\.csv|descriptions/|reports/|attempts/|tasks/)'

# Iterate every line containing `git add scripts/pipeline/`.
while IFS= read -r line; do
  # Strip leading line-number prefix `NN:` from grep -n output.
  lineno="${line%%:*}"
  body="${line#*:}"

  # Extract every `scripts/pipeline/<TOKEN>` substring on this line.
  # `<TOKEN>` = any non-whitespace, non-shell-control sequence.
  tokens=$(echo "$body" \
    | grep -oE 'scripts/pipeline/[^[:space:]&|;>]*' \
    || true)

  if [[ -z "$tokens" ]]; then
    # Defensive: the outer grep matched but the extractor did not.
    # Treat as a regression-worthy anomaly rather than silently passing.
    assert_fail "case2: line $lineno: 'scripts/pipeline/' present but no extractable token"
    continue
  fi

  # Each token must match an allowed sub-path.
  while IFS= read -r tok; do
    [[ -z "$tok" ]] && continue
    if [[ "$tok" =~ ^scripts/pipeline/?$ ]]; then
      # Bare `scripts/pipeline` or `scripts/pipeline/` slipped through —
      # case 1 should have caught the trailing-slash form, but there is
      # also a no-slash variant worth flagging here.
      assert_fail "case2: line $lineno: bare-dir token '$tok'"
    elif echo "$tok" | grep -qE "^${allowed_re}"; then
      assert_pass "case2: line $lineno: '$tok' is whitelisted"
    else
      assert_fail "case2: line $lineno: '$tok' is NOT in the R13-A whitelist"
    fi
  done <<< "$tokens"
# Exclude comment lines (the R13-A explanatory comment at L1306 quotes the
# old `git add scripts/pipeline/` form for context; that's documentation,
# not executable code, and must not trip case 2).
done < <(grep -nE 'git add[^|]*scripts/pipeline/' "$SUT" \
         | grep -vE '^[0-9]+:[[:space:]]*#' \
         || true)

# ─── Case 3: `git add -A` calls stay in worktree context ─────────────────
# `-A` is legitimate inside the worktree (auto-improve-* branch) but
# disastrous if invoked after `cd "$PROJECT_DIR"` because it would stage
# every dirty file on main (Round-12 incident class).
#
# We scan every `git add -A` line and verify the SAME line does NOT
# also contain `cd "$PROJECT_DIR"`. We do NOT try to model multi-line
# control flow — that's a behavioural property the integration cron
# proves daily.
while IFS= read -r line; do
  lineno="${line%%:*}"
  body="${line#*:}"
  if echo "$body" | grep -qE 'cd[[:space:]]+"\$PROJECT_DIR"[[:space:]]*&&[[:space:]]*git add -A'; then
    assert_fail "case3: line $lineno: 'cd \$PROJECT_DIR && git add -A' (would sweep main)"
  else
    assert_pass "case3: line $lineno: 'git add -A' has no PROJECT_DIR prefix on same line"
  fi
done < <(grep -nE 'git add -A' "$SUT" || true)

# ─── Case 4: `cd "$PROJECT_DIR" && git add ...` uses specific paths ──────
# Mirror of case 3 from the other direction: when we DO opt into the
# main worktree, the `git add` argument list must be specific paths.
# Allowed forms:
#   * one or more `scripts/pipeline/<allowed>` tokens
#   * `vitest.config.ts` (coverage-ratchet path; wouldn't actually
#     appear with `cd "$PROJECT_DIR"` today but we permit it)
project_add_re='cd[[:space:]]+"\$PROJECT_DIR"[[:space:]]*&&[[:space:]]*git add[[:space:]]+'

while IFS= read -r line; do
  lineno="${line%%:*}"
  body="${line#*:}"

  # Slice the substring after `git add ` until the next shell control or
  # IO-redirect (e.g. `2>/dev/null`, `&>/dev/null`). Without the explicit
  # digit-redirect strip, the leading `2` of `2>/dev/null` is captured as
  # a bogus path token. We strip everything from the first `[0-9]?[>&]`
  # onward, then split.
  args=$(echo "$body" | grep -oE 'git add[[:space:]]+[^&|;]*' | head -1)
  args="${args#git add}"
  # trim leading whitespace
  args="${args## }"
  args="${args## }"
  # Drop trailing IO redirect: ` 2>/dev/null`, ` &>/dev/null`, ` >/dev/null`.
  args="${args%% [0-9]>*}"
  args="${args%% &>*}"
  args="${args%% >*}"

  # Forbid `-A` in PROJECT_DIR context.
  if echo "$args" | grep -qE '(^|[[:space:]])-A([[:space:]]|$)'; then
    assert_fail "case4: line $lineno: 'cd \$PROJECT_DIR && git add -A' detected"
    continue
  fi

  # Every token must be either an allowed scripts/pipeline path or
  # vitest.config.ts. Bare `scripts/pipeline/` triggers a fail.
  bad=0
  for tok in $args; do
    [[ -z "$tok" ]] && continue
    case "$tok" in
      vitest.config.ts) ;;
      scripts/pipeline/) bad=1; break ;;
      scripts/pipeline/*)
        if ! echo "$tok" | grep -qE "^${allowed_re}"; then
          bad=1; break
        fi
        ;;
      *)
        # Unknown path — fail loudly so any new `cd $PROJECT_DIR && git
        # add <new-thing>` lands here as an explicit decision.
        bad=1; break ;;
    esac
  done
  if [[ "$bad" -eq 0 ]]; then
    assert_pass "case4: line $lineno: PROJECT_DIR-scope add uses whitelisted paths"
  else
    assert_fail "case4: line $lineno: PROJECT_DIR-scope add includes non-whitelist path ('$args')"
  fi
done < <(grep -nE "$project_add_re" "$SUT" || true)

# ─── Case 5: R13-A comment marker present ────────────────────────────────
# The single load-bearing string future readers grep for when asking
# "why is this whitelisted?". Losing it costs context — and historically,
# unannotated narrowings get reverted on the next "tidy up" pass.
assert_grep_in \
  "case5: '2026-05-09 R13-A' comment marker present" \
  '2026-05-09 R13-A' \
  "$SUT"

# ─── Summary ─────────────────────────────────────────────────────────────
echo ""
echo "Results: $passed passed, $failed failed"
if [[ "$failed" -gt 0 ]]; then
  exit 1
fi
exit 0
