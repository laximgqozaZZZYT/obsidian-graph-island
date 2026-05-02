---
name: issues
description: List and manage the autonomous pipeline issue queue. Shows pending, in-progress, and completed issues.
argument-hint: "[clear done | cancel <number> | reprioritize <number> <priority>]"
---

Show the current state of all user-reported and auto-discovered issues.

## What to do

1. List all pending issues:
```bash
for f in scripts/pipeline/issues/*.md; do
  [ -f "$f" ] || continue
  name=$(basename "$f")
  prio=$(grep -oP 'priority: \K\w+' "$f" || echo "?")
  status=$(grep -oP 'status: \K[\w-]+' "$f" || echo "?")
  src=$(grep -oP 'source: \K[\w-]+' "$f" || echo "user")
  summary=$(grep -oP 'summary: \K.*' "$f" || echo "?")
  echo "[$status] $prio ($src) $name — $summary"
done
```

2. List completed issues:
```bash
ls scripts/pipeline/issues/done/*.md 2>/dev/null | while read f; do
  name=$(basename "$f")
  summary=$(grep -oP 'summary: \K.*' "$f" || echo "?")
  echo "[done] $name — $summary"
done
```

3. Present as a table to the user.

## If $ARGUMENTS contains a command

- `clear done` → Remove all files in `scripts/pipeline/issues/done/`
- `cancel <number>` → Set status to `cancelled` and move to `done/`
- `reprioritize <number> <priority>` → Update priority field

## Language
Respond in the same language as the user.
