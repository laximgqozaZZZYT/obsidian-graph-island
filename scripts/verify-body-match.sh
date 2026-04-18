#!/usr/bin/env bash
# verify-body-match.sh — Verify target .md body matches baseline.json body (subtask-3 of 759-730).
#
# Contract (authoritative: scripts/pipeline/tasks/783-759-subtask.md):
#   Input   : argv[1] = target .md file path (required)
#             argv[2] = baseline.json path
#                       (default: .claude/tasks/730-717-status-done-edit/baseline.json)
#             baseline.json shape: { "body": "<original '## Description' block>", ... }
#   Stdout  : "BODY OK" on match; on mismatch, "ERROR: ..." with first diff line
#             number and expected/actual lines (Python repr for whitespace clarity).
#   Exit    : 0 on match, 2 on body mismatch, 1 on I/O / argument error.
#
# Comparison is byte-exact: whitespace, tabs, wiki-links ([[...]]), and trailing
# newlines must all match. `jq -j` keeps the baseline bytes as-is (no injected
# newline) and `grep -b` + `tail -c` slice the target without awk/sed normalizing
# the final \n.

set -uo pipefail

target=${1:-}
baseline=${2:-.claude/tasks/730-717-status-done-edit/baseline.json}

if [[ -z "$target" ]]; then
  echo "usage: $0 <target-md-file> [baseline-json]" >&2
  exit 1
fi

if [[ ! -f "$target" ]]; then
  echo "ERROR: target file not found: $target" >&2
  exit 1
fi

if [[ ! -f "$baseline" ]]; then
  echo "ERROR: baseline not found: $baseline" >&2
  exit 1
fi

# Locate first "## Description" heading. grep -b emits "<byte>:<line>" on stdout.
desc_hit=$(grep -b -m1 '^## Description' "$target" || true)
if [[ -z "$desc_hit" ]]; then
  echo "ERROR: '## Description' not found in target: $target" >&2
  exit 1
fi
byte_off=${desc_hit%%:*}

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

tail -c +$((byte_off + 1)) "$target" > "$tmpdir/actual"
if ! jq -j '.body // empty' "$baseline" > "$tmpdir/expected" 2>"$tmpdir/jq.err"; then
  echo "ERROR: failed to parse baseline.json" >&2
  cat "$tmpdir/jq.err" >&2
  exit 1
fi

if ! [[ -s "$tmpdir/expected" ]]; then
  echo "ERROR: baseline.json has no 'body' field: $baseline" >&2
  exit 1
fi

if cmp -s "$tmpdir/expected" "$tmpdir/actual"; then
  echo "BODY OK"
  exit 0
fi

python3 - "$tmpdir/expected" "$tmpdir/actual" <<'PY'
import sys
exp = open(sys.argv[1], 'rb').read().decode('utf-8', errors='replace')
act = open(sys.argv[2], 'rb').read().decode('utf-8', errors='replace')
exp_lines = exp.split('\n')
act_lines = act.split('\n')
for i, (e, a) in enumerate(zip(exp_lines, act_lines)):
    if e != a:
        print(f'ERROR: first diff at line {i + 1}')
        print(f'expected: {e!r}')
        print(f'actual:   {a!r}')
        sys.exit(2)
# Shared prefix matched; the files differ only in trailing lines or trailing newline.
print(f'ERROR: line count differs (expected {len(exp_lines)}, actual {len(act_lines)})')
n = min(len(exp_lines), len(act_lines))
if len(exp_lines) > len(act_lines):
    print(f'expected extra line {n + 1}: {exp_lines[n]!r}')
else:
    print(f'actual extra line {n + 1}: {act_lines[n]!r}')
sys.exit(2)
PY
exit 2
