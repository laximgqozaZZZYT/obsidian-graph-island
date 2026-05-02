---
name: reject
description: Reject a feature-proposal issue, archiving it so the proposer learns and the queue clears.
---

# /reject — Reject a feature proposal

Close a `source=feature-proposal` issue with a recorded reason so the
slot frees up for the next proposer run.

## Argument

`/reject <issue-id> [reason...]`

Examples:
  - `/reject #1376 既存スナップショット機能と役割が重複`
  - `/reject 1376 重複`
  - `/reject 1376-hover-similar-suggest-top3 too noisy on dense graphs`

If the user gives no reason, ask once for a brief justification — then
proceed when answered. Do NOT reject without a recorded reason; the
reason is the proposer's training signal.

## What to do

1. Resolve the issue id (handle `#NNNN`, `NNNN`, `NNNN-slug`).
2. Verify the issue exists and is `source=feature-proposal`.
   - Refuse on any other source.
   - If `status` is `done` / `cancelled`, tell the user, do nothing.
3. Set status to `cancelled` and record completion date:
   ```bash
   python3 scripts/pipeline/csv_lib.py set_status issues "$ISSUE_ID" cancelled
   python3 scripts/pipeline/csv_lib.py set_field  issues "$ISSUE_ID" completed "$(date -I)"
   ```
4. Append to the description file:
   ```
   ## Rejected
   - YYYY-MM-DD: rejected by user
   - reason: <verbatim reason>
   ```
5. Also write a copy under `scripts/pipeline/descriptions/rejected/<date>-<slug>.md`
   so the proposer's archive of rejections includes user-rejected items
   alongside critic-rejected ones (same directory, same shape).
6. Commit:
   ```
   chore(proposal): reject #<id> — <short reason>
   ```
7. Tell the user the slot is freed and the proposer can fill it again on the next Monday cron tick.

## Refusal cases

- Issue not found: list pending feature-proposal ids.
- Source is not `feature-proposal`: refuse — `/reject` is for proposals only. For other issues use the standard kaizen workflow or close manually.
- No reason provided after asking: do nothing.

## Language

Respond in Japanese (matches user pattern).
