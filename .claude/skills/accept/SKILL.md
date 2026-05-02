---
name: accept
description: Accept a feature-proposal issue so the autonomous pipeline can decompose and implement it.
---

# /accept — Accept a feature proposal

Promote a `source=feature-proposal` issue from "awaiting review" to
"queued for implementation" so the autonomous pipeline picks it up.

## Argument

The issue id (with or without leading `#` and slug):
  - `/accept #1376`
  - `/accept 1376-hover-similar-suggest-top3`
  - `/accept 1376` (slug auto-resolved)

## What to do

1. Resolve the issue id from the user's argument (handle `#NNNN`, `NNNN`, `NNNN-slug` variants).
2. Verify the issue exists and is `source=feature-proposal` AND `status=pending`.
   - If `status` is already `decomposed` / `done` / `cancelled`, tell the user.
   - If `source` is anything else (auto-discovered, kaizen, user, e2e-patrol), refuse with a clear message — `/accept` is only for `feature-proposal`.
3. Bump the priority from `medium` → `high` so the autonomous gate selects it next cycle.
4. Append a one-line acceptance marker to the description file under
   `## Accepted` so audit history is intact:
   ```
   ## Accepted
   - YYYY-MM-DD: accepted by user (priority promoted medium → high)
   ```
5. Commit:
   ```
   chore(proposal): accept #<id> (medium → high)
   ```
6. Tell the user the next cycle (`*/20` cron) will pick it up.

## Implementation notes

Use `scripts/pipeline/csv_lib.py` for the field updates:
```bash
python3 scripts/pipeline/csv_lib.py set_field issues "$ISSUE_ID" priority high
```

Do NOT touch any other field. Do NOT push directly to main — let the operator's normal commit flow handle that.

## Refusal cases

- Issue not found: tell user with a list of pending feature-proposal ids.
- Status is `done` or `cancelled`: tell user, do nothing.
- Source is not `feature-proposal`: refuse — `/accept` is reserved for proposer output. Use the standard kaizen/issue tools for other sources.

## Language

Respond in Japanese (matches user pattern).
