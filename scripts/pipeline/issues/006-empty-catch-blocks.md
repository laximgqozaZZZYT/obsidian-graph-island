---
priority: medium
reported: 2026-04-05
status: pending
source: auto-discovered
summary: 44個の空catch — エラーが握りつぶされている
---

## Description
catch {} や catch() でエラーを黙殺している箇所が44個。\n予期しない動作の原因になる。最低限 error を parameter として受け取るべき。

## Acceptance criteria
- [ ] 空catchを 10 個以下に (適切なエラー処理を追加)
