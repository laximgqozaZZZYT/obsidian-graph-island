---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 596-582-graphviewcontainer-ts-8597
depends: none
summary: GraphViewContainer.ts の行数計測と閾値判定
---

## Description (subtask of 596-582-graphviewcontainer-ts-8597)

`wc -l src/views/GraphViewContainer.ts` を実行し、行数を取得する。
  - 結果を変数として記録 (例: ACTUAL_LINES)
  - CLAUDE.md の "Max Allowed" 8597 と比較
  - 判定ルール:
    - ACTUAL_LINES ≤ 8597: PASS
    - ACTUAL_LINES > 8597: FAIL (違反)
  - コード変更は一切行わない (verify-only)
  - 出力を標準出力に表示: `GraphViewContainer.ts: <行数> lines (max: 8597) → PASS/FAIL`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
