---
priority: high
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 582-570-graphviewcontainer-ts-verify-only
depends: none
summary: GraphViewContainer.ts の行数が 8597 を超えていないか検証
---

## Description (subtask of 582-570-graphviewcontainer-ts-verify-only)

`wc -l src/views/GraphViewContainer.ts` を実行し、出力行数が CLAUDE.md の "Max Allowed" (8597行) を超えていないことを確認する。
  コード変更は禁止。結果を検証レポートに記録。
  違反時は新規 issue を `issues/` に作成 (修正はこのタスク内で行わない)。
  許容: ちょうど 8597 行まで (ratchet down のみ許可)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
