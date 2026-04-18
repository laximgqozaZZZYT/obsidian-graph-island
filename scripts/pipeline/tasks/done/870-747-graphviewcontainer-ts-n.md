---
priority: high
reported: 2026-04-19
status: done
source: decomposed
parent: 747-725-claude-md-god-object-policy-ratchet-down
depends: none
summary: GraphViewContainer.ts の現在行数 N を測定し、判定結果を確定
---

## Description (subtask of 747-725-claude-md-god-object-policy-ratchet-down)

`wc -l src/views/GraphViewContainer.ts` で現在行数 N を取得する。
  subtask-2 の測定結果が既にある場合はそれを再検証するために再測定する。
  判定ロジック:
  - N < 8597 → CLAUDE.md を N に ratchet-down (親タスク 747-725 で実施)
  - N == 8597 → 据え置き (no-op)
  - N > 8597 → ゲート違反 (起こり得ない)

## Measurement result (2026-04-19)

```
$ wc -l src/views/GraphViewContainer.ts
8597 src/views/GraphViewContainer.ts
```

- **N = 8597**
- **判定: N == 8597 → CLAUDE.md は据え置き (ratchet-down 不要)**
- 親タスク 747-725 の条件分岐 "N >= 8597 の場合: 何もせず次タスクへ進む" を適用。

## Acceptance criteria
- [x] 実装が完了し、テストが通ること (測定のみ、コード変更なし)
- [x] CLAUDE.md のルールに違反しないこと (編集なし)
