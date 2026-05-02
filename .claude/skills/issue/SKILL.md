---
name: issue
description: Submit a task or bug report to the autonomous improvement pipeline. Use when the user reports a bug, quality issue, or improvement request.
argument-hint: "<description of the issue>"
---

Register a user-reported issue for the autonomous pipeline to pick up.
User issues are **always prioritized above** automatic improvements.

**Input**: $ARGUMENTS

## What to do

1. Parse the user's input into a structured issue file
2. Assign a priority: `critical` > `high` > `medium` > `low`
3. Write the issue to `scripts/pipeline/issues/` as a numbered `.md` file
4. Confirm to the user what was registered

## Issue file format

```markdown
---
priority: high
reported: YYYY-MM-DD
status: pending
summary: One-line summary
---

## Description
Full description of the issue or requirement.

## Acceptance criteria
- [ ] Criterion 1
- [ ] Criterion 2
```

## File naming

Find the next available number:
```bash
ls scripts/pipeline/issues/*.md scripts/pipeline/issues/done/*.md 2>/dev/null | xargs -I{} basename {} | grep -oP '^\d+' | sort -n | tail -1
```
New file: `scripts/pipeline/issues/{next_number}-{slug}.md`

## Priority assignment guide

- **critical**: Build broken, tests failing, runtime crash, data loss risk
- **high**: Visible bug, UX regression, user-reported functional issue
- **medium**: Enhancement, improvement request
- **low**: Nice-to-have, cosmetic, minor polish

## After registering

Tell the user:
- Issue number and file path
- Assigned priority
- That the autonomous pipeline will pick it up in the next cycle (within 30 minutes)
- They can check status with `/issues`

## Language
Respond in the same language as the user.
