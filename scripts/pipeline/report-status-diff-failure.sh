#!/usr/bin/env bash
# report-status-diff-failure.sh — Structured failure report for frontmatter
# `status: done` edit verification (sibling of verify-status-only-diff.sh).
#
# Pipeline role (scripts/pipeline/tasks/738-721-subtask.md):
#   Runs ONLY when the status-edit verification fails. Its job is to explain
#   the failure in a form the autonomous loop (or a human) can act on, so the
#   one-line `ERROR: ...` from verify-status-only-diff.sh is not enough.
#
#   Verification target is the file's current content (not `git diff`):
#     - `status: done` appears in frontmatter exactly once
#     - `status: pending` / `status: in-progress` do not remain
#     - other recognized fields (priority, reported, parent, depends, summary,
#       source) are still present
#
# Report sections (matches the 4-item spec of task 738):
#   1. which check failed (duplicate status / pending remaining / field missing)
#   2. current frontmatter content (quoted, with line numbers)
#   3. expected vs actual in `- expected` / `+ actual` format
#   4. whether parent task 702-691-edit-status needs re-execution
#
# Usage:
#   bash scripts/pipeline/report-status-diff-failure.sh <issue-file>
#
# Exit codes:
#   0 = verification actually PASSED (report body says "nothing to report")
#   1 = real failure — structured report emitted on stdout
#   2 = invocation error (bad args / file missing / no frontmatter)
set -uo pipefail

if [[ $# -lt 1 ]]; then
	echo "Usage: $0 <issue-file>" >&2
	exit 2
fi

ISSUE_FILE="$1"
if [[ ! -f "$ISSUE_FILE" ]]; then
	echo "Usage error: file not found: $ISSUE_FILE" >&2
	exit 2
fi

# --- Extract frontmatter block (lines between the first two `---`) -----------
fm_lines=()            # raw content lines, no line numbers
fm_numbered=()         # "<n>: <content>" for quoted output
fm_start=0
fm_end=0
lineno=0
in_fm=0
while IFS= read -r line || [[ -n "$line" ]]; do
	lineno=$((lineno + 1))
	if [[ "$line" == "---" ]]; then
		if [[ "$fm_start" -eq 0 ]]; then
			fm_start="$lineno"
			in_fm=1
			continue
		fi
		fm_end="$lineno"
		break
	fi
	if [[ "$in_fm" -eq 1 ]]; then
		fm_lines+=("$line")
		fm_numbered+=("$lineno: $line")
	fi
done < "$ISSUE_FILE"

if [[ "$fm_start" -ne 1 || "$fm_end" -eq 0 ]]; then
	echo "Usage error: no frontmatter block in $ISSUE_FILE" >&2
	exit 2
fi

# --- Run the individual content checks ---------------------------------------
done_count=0
pending_count=0
inprogress_count=0
actual_status_line=""
for l in "${fm_lines[@]}"; do
	case "$l" in
		"status: done")        done_count=$((done_count + 1)); actual_status_line="$l" ;;
		"status: pending")     pending_count=$((pending_count + 1)); actual_status_line="$l" ;;
		"status: in-progress") inprogress_count=$((inprogress_count + 1)); actual_status_line="$l" ;;
		"status:"*)            actual_status_line="$l" ;;
	esac
done
[[ -z "$actual_status_line" ]] && actual_status_line="<no status line>"

required_fields=(priority reported parent depends summary source)
missing_fields=()
for f in "${required_fields[@]}"; do
	if ! printf '%s\n' "${fm_lines[@]}" | grep -qE "^${f}:"; then
		missing_fields+=("$f")
	fi
done

failures=()
(( done_count == 0 ))             && failures+=("status: done 欠落 (expected exactly 1)")
(( done_count > 1 ))               && failures+=("status: done 重複 ($done_count occurrences)")
(( pending_count > 0 ))            && failures+=("status: pending 残存 ($pending_count occurrences)")
(( inprogress_count > 0 ))         && failures+=("status: in-progress 残存 ($inprogress_count occurrences)")
(( ${#missing_fields[@]} > 0 ))    && failures+=("フィールド欠落: ${missing_fields[*]}")

# --- PASS path: no report -----------------------------------------------------
if [[ "${#failures[@]}" -eq 0 ]]; then
	echo "# Status-Diff Failure Report — $ISSUE_FILE"
	echo ""
	echo "No failure to report: all checks PASS ($done_count done / $pending_count pending / $inprogress_count in-progress / 0 missing fields)."
	exit 0
fi

# --- FAIL path: emit structured report ---------------------------------------
echo "# Status-Diff Failure Report — $ISSUE_FILE"
echo ""
echo "## 1. Failed checks"
for msg in "${failures[@]}"; do
	echo "- $msg"
done
echo ""
echo "## 2. Current frontmatter"
echo '```'
printf '%s\n' "${fm_numbered[@]}"
echo '```'
echo ""
echo "## 3. Expected vs actual (status line)"
echo "- expected: status: done"
echo "+ actual:   ${actual_status_line}"
echo ""
echo "## 4. Parent re-execution (702-691-edit-status)"
if (( done_count == 0 )) && (( pending_count + inprogress_count > 0 )); then
	echo "- YES — 親タスクが status 書き換えを実行していない。再実行が必要。"
elif (( done_count > 1 )); then
	echo "- YES — 親タスクが誤って status 行を複数挿入した。再実行前に手動クリーンアップ必要。"
elif (( ${#missing_fields[@]} > 0 )); then
	echo "- NO — 他フィールドが欠落しており、破損の疑い。親再実行ではなく手動修復を推奨。"
else
	echo "- MAYBE — 原因未分類。上記 frontmatter を目視確認してから判断。"
fi

exit 1
