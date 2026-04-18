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
#             no diff, wrong status value, etc.)
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

# --no-pager so this is safe under CI/automation; --no-color so line prefixes
# are raw "-" / "+" instead of ANSI-wrapped.
diff_output="$(git --no-pager diff --no-color -- "$ISSUE_FILE")"

if [[ -z "$diff_output" ]]; then
	echo "ERROR: no diff for $ISSUE_FILE (expected 1 status-line change)" >&2
	exit 1
fi

removed=()
added=()
nl_changed=0

# Walk the diff, sorting lines into: skip (headers), removed (content '-'),
# added (content '+'), or flag the trailing-newline marker.
while IFS= read -r line; do
	case "$line" in
		"diff --git "* \
		| "index "* \
		| "--- "* \
		| "+++ "* \
		| "@@"* \
		| "new file mode "* \
		| "deleted file mode "* \
		| "old mode "* \
		| "new mode "* \
		| "similarity index "* \
		| "rename from "* \
		| "rename to "* \
		| "copy from "* \
		| "copy to "* \
		| "Binary files "* )
			;;
		"\\ No newline at end of file"*)
			nl_changed=1
			;;
		"-"*)
			removed+=("${line:1}")
			;;
		"+"*)
			added+=("${line:1}")
			;;
	esac
done <<<"$diff_output"

if [[ "$nl_changed" -eq 1 ]]; then
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

echo "OK: status ${old_status}→done on ${ISSUE_FILE}"
