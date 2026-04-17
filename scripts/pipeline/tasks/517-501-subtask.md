---
priority: medium
reported: 2026-04-17
status: in-progress
source: decomposed
parent: 501-491-
depends: none
summary: subtask
---

## Description (subtask of 501-491-)

`★ Insight ─────────────────────────────────────`
- 元タスクは「計測 → 判定 → コミット」の原子的作業で、実測値 8597 行 ≤ 8612 のため「verify完了」パスで即終了できる
- CLAUDE.md の max allowed は 8597 (現行値)、親issue文面の 8612 より厳しい。厳しい方を採用すべき
- 分解は不要レベルだが、パイプライン仕様上 SUBTASK 形式で出力する必要がある
`─────────────────────────────────────────────────`

実測 8597 行。CLAUDE.md の上限 8597 と同値(≤ 8612 でもある)のため、このsubtaskは単一タスクで完了可能です。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
