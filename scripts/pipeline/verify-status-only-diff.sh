#!/usr/bin/env bash
# verify-status-only-diff.sh — Verify that `git diff <issue-file>` shows
# exactly one frontmatter `status:` line change (pending|in-progress → done)
# and nothing else.
#
# Contract (from scripts/pipeline/tasks/733-719-diff-status.md):
#   Args   : <issue-file>
#   PASS   : prints "OK: status <old>→done on <path>" to stdout, exit 0
#   FAIL   : prints "ERROR: <reason>" to stderr, exit 1
#            (other fields changed, body changed, trailing newline changed,
#             change outside frontmatter, no diff, wrong status value, etc.)
#   Usage  : exit 2 when the invocation itself is wrong
#
# Does NOT modify any file. Read-only verification.
set -euo pipefail

if [[ $# -lt 1 ]]; then
	echo "Usage: $0 <issue-file>" >&2
	exit 2
fi

ISSUE_FILE="$1"
if [[ ! -f "$ISSUE_FILE" ]]; then
	echo "ERROR: file not found: $ISSUE_FILE" >&2
	exit 2
fi

# --no-pager: CI-safe.  --no-color: raw "+/-" prefixes (no ANSI).
# -U0:        strip context so the only in-hunk lines are real changes;
#             this also removes the "header vs `++ foo` content" ambiguity.
diff_output="$(git --no-pager diff --no-color -U0 -- "$ISSUE_FILE" 2>/dev/null)" || {
	echo "ERROR: git diff failed for $ISSUE_FILE" >&2
	exit 1
}

if [[ -z "$diff_output" ]]; then
	echo "ERROR: no diff for $ISSUE_FILE (expected 1 status-line change)" >&2
	exit 1
fi

removed=()
added=()
removed_nl=0
added_nl=0
new_change_line=0    # 1-based line number of the (single) added line in new file
in_hunk=0
prev_side=""         # "-" or "+" — which side the last in-hunk content belonged to
hunk_re='^@@ -[0-9]+(,[0-9]+)? [+]([0-9]+)'

# Pre-hunk lines (diff --git, index, ---, +++, mode, rename, …) are skipped
# wholesale via the in_hunk state.  Only after seeing "@@" do `-`/`+` lines
# represent actual content changes — so a literal "++ foo" added line is
# correctly counted instead of being mistaken for a "+++ " file header.
while IFS= read -r line; do
	if [[ "$in_hunk" -eq 0 ]]; then
		if [[ "$line" =~ $hunk_re ]]; then
			new_change_line="${BASH_REMATCH[2]}"
			in_hunk=1
		fi
		continue
	fi
	case "$line" in
		"@@"*)
			# Second hunk = a second change region elsewhere → already a fail.
			# Force the count check below to trip.
			added+=("__second_hunk__")
			prev_side=""
			;;
		"\\ No newline at end of file"*)
			# This marker belongs to the side of the immediately preceding line.
			# Counting per-side lets us distinguish "no change in newline state"
			# (marker appears on both sides) from a real newline state change.
			[[ "$prev_side" == "-" ]] && removed_nl=$((removed_nl + 1))
			[[ "$prev_side" == "+" ]] && added_nl=$((added_nl + 1))
			;;
		"-"*)
			removed+=("${line:1}")
			prev_side="-"
			;;
		"+"*)
			added+=("${line:1}")
			prev_side="+"
			;;
	esac
done <<<"$diff_output"

if [[ "$removed_nl" -ne "$added_nl" ]]; then
	echo "ERROR: trailing newline changed in $ISSUE_FILE" >&2
	exit 1
fi

if [[ "${#removed[@]}" -ne 1 || "${#added[@]}" -ne 1 ]]; then
	echo "ERROR: expected exactly 1 removed + 1 added line, got ${#removed[@]} removed / ${#added[@]} added in $ISSUE_FILE" >&2
	exit 1
fi

old_line="${removed[0]}"
new_line="${added[0]}"

case "$old_line" in
	"status: pending")     old_status="pending" ;;
	"status: in-progress") old_status="in-progress" ;;
	*)
		echo "ERROR: removed line is not a recognized status line: '$old_line'" >&2
		exit 1
		;;
esac

if [[ "$new_line" != "status: done" ]]; then
	echo "ERROR: added line is not 'status: done': '$new_line'" >&2
	exit 1
fi

# Locate the frontmatter block: file must start with "---" on line 1, and the
# next "---" closes the block.  The change must land strictly between them so
# that a body-side `status:` (e.g. inside a code block) cannot impersonate it.
fm_start=0
fm_end=0
lineno=0
while IFS= read -r fl || [[ -n "$fl" ]]; do
	lineno=$((lineno + 1))
	if [[ "$fl" == "---" ]]; then
		if [[ "$fm_start" -eq 0 ]]; then
			fm_start="$lineno"
		else
			fm_end="$lineno"
			break
		fi
	fi
done < "$ISSUE_FILE"

if [[ "$fm_start" -ne 1 || "$fm_end" -eq 0 ]]; then
	echo "ERROR: $ISSUE_FILE has no frontmatter block (--- ... ---)" >&2
	exit 1
fi

if (( new_change_line <= fm_start || new_change_line >= fm_end )); then
	echo "ERROR: status line change at line $new_change_line is outside frontmatter (lines $((fm_start+1))..$((fm_end-1))) in $ISSUE_FILE" >&2
	exit 1
fi

echo "OK: status ${old_status}→done on ${ISSUE_FILE}"
