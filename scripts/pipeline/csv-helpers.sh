#!/usr/bin/env bash
# ============================================================
# csv-helpers.sh — Bash facade for scripts/pipeline/csv_lib.py
# ============================================================
# Source this file from any pipeline script that needs to read or mutate
# the CSV state files. Heavy lifting (RFC4180 parse, flock, atomic
# rename, FK validation) is delegated to csv_lib.py.
#
#   . "$(dirname "$0")/csv-helpers.sh"   # in the same scripts/pipeline/
#
# Conventions:
# - All commands take a <kind> = issues | tasks | attempts.
# - Read functions print results to stdout, one id per line.
# - Mutation functions are silent on success, write to stderr on error,
#   and exit non-zero on failure.
# - All write paths take a per-kind flock; readers are lock-free.
# ============================================================
set -uo pipefail

CSV_HELPERS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CSV_LIB="$CSV_HELPERS_DIR/csv_lib.py"

if [[ ! -x "$CSV_LIB" ]]; then
  echo "csv-helpers.sh: csv_lib.py not found or not executable at $CSV_LIB" >&2
  return 1 2>/dev/null || exit 1
fi

_csv_run() {
  python3 "$CSV_LIB" "$@"
}

# ── Read APIs (lock-free) ────────────────────────────────────

# csv_get_field <kind> <id> <field>
csv_get_field()        { _csv_run get_field "$1" "$2" "$3"; }

# csv_get_status <kind> <id>
csv_get_status()       { _csv_run get_status "$1" "$2"; }

# csv_select_pending <kind> [priority]
#   Prints one id per line.
csv_select_pending()   { _csv_run select_pending "$@"; }

# csv_select_by_parent <kind> <parent_id>
csv_select_by_parent() { _csv_run select_by_parent "$1" "$2"; }

# csv_select_by_status <kind> <status>
csv_select_by_status() { _csv_run select_by_status "$1" "$2"; }

# csv_count_active <kind>
#   Counts pending + in-progress (+ decomposed for issues).
csv_count_active()     { _csv_run count_active "$1"; }

# csv_next_id_num
#   Next monotonically-increasing numeric prefix shared between issues
#   and tasks (the legacy invariant — same number is never reused).
csv_next_id_num()      { _csv_run next_id_num; }

# csv_select_active_by_slug <kind> <slug>
#   Prints ids whose id ends with `-<slug>` and whose status is active
#   (pending|in-progress|decomposed|undecomposable). Used by discovery
#   scripts to skip re-filing problems that already have a live row.
csv_select_active_by_slug() { _csv_run select_active_by_slug "$1" "$2"; }

# csv_select_blocked_by_slug <kind> <slug>
#   Prints ids whose id ends with `-<slug>` and whose status is `blocked`.
#   Used by the 24h cooldown check in file_issue().
csv_select_blocked_by_slug() { _csv_run select_blocked_by_slug "$1" "$2"; }

# csv_max_summary_jaccard <kind> <summary>
#   Outputs `<score>|<best_match_summary>` where score is the Jaccard
#   word-set similarity (×100, integer) against the closest active row.
csv_max_summary_jaccard() { _csv_run max_summary_jaccard "$1" "$2"; }

# csv_to_prompt_text <kind> <id>
#   Renders a frontmatter+description string equivalent to the legacy md.
#   Used as Claude prompt input.
csv_to_prompt_text()   { _csv_run to_prompt_text "$1" "$2"; }

# csv_export_md <kind> <id>
#   Same output as csv_to_prompt_text — semantic alias for rollback paths.
csv_export_md()        { _csv_run export_md "$1" "$2"; }

# ── Write APIs (per-kind flock + atomic rename) ───────────────

# csv_set_status <kind> <id> <new_status>
csv_set_status()       { _csv_run set_status "$1" "$2" "$3"; }

# csv_set_field <kind> <id> <field> <value>
csv_set_field()        { _csv_run set_field "$1" "$2" "$3" "$4"; }

# csv_increment_attempts <kind> <id>
#   Bumps decompose_attempts (issues) or attempt_count (tasks); echoes the
#   new value.
csv_increment_attempts() { _csv_run increment_attempts "$1" "$2"; }

# csv_insert <kind> <id> <field=value>...
#   Defaults filled in: status=pending, reported=today, created_at=now,
#   updated_at=now, attempt counter = 0.
csv_insert()           { _csv_run insert "$@"; }

# csv_append_attempt <parent_kind> <parent_id> <note> [session_summary]
#   Appends a row to attempts.csv and bumps the parent's attempt counter.
#   Echoes the new attempt_no.
csv_append_attempt()   { _csv_run append_attempt "$@"; }

# csv_archive <kind> <id>
#   Marks the row as status=done. (No file move; archive is a status flag.)
csv_archive()          { _csv_run archive "$1" "$2"; }

# ── Maintenance ───────────────────────────────────────────────

# csv_validate <kind>
#   Prints validation errors to stderr, exits non-zero if any.
csv_validate()         { _csv_run validate "$1"; }

# csv_self_test
#   Runs csv_lib.py's sandbox self-test (no effect on real data).
csv_self_test()        { _csv_run self_test; }
