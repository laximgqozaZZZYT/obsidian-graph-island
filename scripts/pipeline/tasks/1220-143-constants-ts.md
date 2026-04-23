---
priority: medium
reported: 2026-04-24
status: in-progress
source: decomposed
parent: 143-scattered-constants
depends: none
summary: レイアウト系定数を constants.ts に集約
---

## Description (subtask of 143-scattered-constants)

`src/layouts/` 配下に散在する SCREAMING_CASE 定数を `src/constants.ts` に移動する（約25個）。
  対象:
  - timeline.ts(8), timeline-layout.ts(1), coordinate-engine.ts(6), tree.ts(5), sunburst.ts(2), cluster-force.ts(2), ego-sector.ts(1)
  手順:
  1. `constants.ts` に新セクション `// ---- Layout constants ----` を追加し、プレフィクス `LAYOUT_` または `TIMELINE_`/`TREE_`/`SUNBURST_` を付与して移動（名前衝突時はプレフィクスで明確化）。
  2. 各 `src/layouts/*.ts` から export を削除し、`import { ... } from '../constants'` に置換。
  3. 該当テスト（`tests/layouts/*`, `tests/timeline-*`）が通ることを `pnpm test` で確認。
  除外条件:
  - その関数内部だけで使う純ローカル定数（他ファイル未参照で意味的にファイル固有）は残す。
  禁止:
  - GOD OBJECT 4ファイルの行数を増やさない（定数をそちらへ「まとめ置き」禁止。必ず `constants.ts` 側に）。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
