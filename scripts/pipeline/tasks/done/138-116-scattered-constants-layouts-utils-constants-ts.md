---
priority: medium
reported: 2026-04-15
status: done
source: decomposed
parent: 116-scattered-constants
depends: subtask-3
summary: layouts/ + utils/ のレンダリング定数をconstants.tsに移動
---

## Description (subtask of 116-scattered-constants)

layouts/ (7ファイル15個) と utils/ の数値定数を移動。
  移動対象:
  - layouts/内の力学シミュレーション定数（spring, damping, gravity等）
  - DEFAULT_CELL_SIZE, HASH_PRIME (spatial-grid.ts)
  - BLEND_LABEL_FACTOR (gvc-helpers.ts)
  - FNV_OFFSET, FNV_PRIME (snapshot.ts)
  - INITIAL_SCATTER_X/Y (metadata-parser.ts)
  移動しない:
  - METRIC_NAMES, BUILT_IN_FIELDS, BOOL_OPS 等のSet/Map（ドメインロジック）
  - VALID_KEYS, FIELD_VALIDATOR 等（バリデーション固有）
  pnpm test && pnpm lint で確認。
  目標: 25個削減
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
