---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 725-714-graphviewcontainer-claude-md-ratchet-617
depends: subtask-1
summary: GraphViewContainer.ts の行数と CLAUDE.md の GOD OBJECT Policy 表を照合
---

## Description (subtask of 725-714-graphviewcontainer-claude-md-ratchet-617)

`wc -l src/views/GraphViewContainer.ts` で現在行数 N を取得し、
  CLAUDE.md の GOD OBJECT Policy 表の `GraphViewContainer.ts` 行 (8597) と比較する。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` で N を取得
  2. CLAUDE.md の該当行 (`| src/views/GraphViewContainer.ts | 8597 | 8597 |`) を Read
  3. 判定:
     - N < 8597 → ratchet 対象 (subtask-3 で更新)
     - N >= 8597 → ratchet 不要 (subtask-3 スキップ、無変更)
  4. N値と判定結果を記録 (conversation 内)

  制約:
  - 本体編集禁止
  - src/ tests/ 配下の一切の編集禁止

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
