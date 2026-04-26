#!/usr/bin/env bash
# count-type-assertions.sh
# Count pure type assertions (`expr as Type`) in src/, excluding:
#   - `import { X as Y }` named-import aliases (single- and multi-line)
#   - `import * as X from "..."` namespace imports
#   - `import "..."` side-effect imports
#
# Usage:
#   bash scripts/count-type-assertions.sh             # total + top 10
#   bash scripts/count-type-assertions.sh --top 20    # total + top 20
#   bash scripts/count-type-assertions.sh --list      # one match per line (filename:lineno:source)
set -euo pipefail

TOP=10
MODE="summary"
while [[ $# -gt 0 ]]; do
	case "$1" in
		--top)
			TOP="${2:?--top requires a number}"
			shift 2
			;;
		--list)
			MODE="list"
			shift
			;;
		*)
			echo "Unknown arg: $1" >&2
			exit 2
			;;
	esac
done

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

AWK_PROGRAM='
BEGIN { in_block = 0 }
FNR == 1 { in_block = 0 }
{
	# 1. Side-effect import: `import "...";`
	if ($0 ~ /^[[:space:]]*import[[:space:]]+["'\'']/) { next }
	# 2. Namespace import: `import * as X from "...";`
	if ($0 ~ /^[[:space:]]*import[[:space:]]+\*[[:space:]]+as[[:space:]]+/) { next }
	# 3. Single-line braced import (covers `import { ... } from`, `import type { ... } from`)
	if ($0 ~ /^[[:space:]]*import[[:space:]].*\}[[:space:]]*from[[:space:]]/) { next }
	# 4. Start of multi-line braced import block (no closing brace on this line)
	if (!in_block && $0 ~ /^[[:space:]]*import[[:space:]]+(type[[:space:]]+)?\{[^}]*$/) {
		in_block = 1
		next
	}
	# 5. Inside multi-line braced import block; closes when we see `} from "..."`
	if (in_block) {
		if ($0 ~ /\}[[:space:]]*from[[:space:]]/) { in_block = 0 }
		next
	}
	# 6. Regular code: emit if it contains ` as TypeIdentifier`
	if ($0 ~ / as [A-Z]/) {
		print FILENAME ":" FNR ":" $0
	}
}
'

mapfile -t FILES < <(find src -type f \( -name '*.ts' -o -name '*.tsx' \) | sort)

if [[ ${#FILES[@]} -eq 0 ]]; then
	echo "No source files under src/" >&2
	exit 1
fi

MATCHES="$(awk "$AWK_PROGRAM" "${FILES[@]}")"

if [[ "$MODE" == "list" ]]; then
	printf '%s\n' "$MATCHES"
	exit 0
fi

if [[ -z "$MATCHES" ]]; then
	TOTAL=0
else
	TOTAL=$(printf '%s\n' "$MATCHES" | wc -l | tr -d ' ')
fi

echo "Total type assertions (excluding import aliases): $TOTAL"
echo
echo "Top $TOP files:"
if [[ -n "$MATCHES" ]]; then
	printf '%s\n' "$MATCHES" | awk -F: '{ print $1 }' | sort | uniq -c | sort -rn | head -n "$TOP"
fi
