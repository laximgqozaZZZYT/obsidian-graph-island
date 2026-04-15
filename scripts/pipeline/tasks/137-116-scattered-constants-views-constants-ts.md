---
priority: high
reported: 2026-04-15
status: in-progress
source: decomposed
parent: 116-scattered-constants
depends: subtask-2
summary: views/ の残りレンダリング定数をconstants.tsに移動
---

## Description (subtask of 116-scattered-constants)

views/ 配下の残りファイルから、レンダリング閾値・色・サイズ定数を移動。
  対象: 各ファイル1-3個ずつ、計約20個。
  移動基準:
  - 数値リテラル定数（色、サイズ、速度、alpha）→ 移動する
  - Set/Map/配列/正規表現定数（HOP_PATTERN等）→ 移動しない（モジュール固有）
  AUTO_SNAP_PREFIX, AUTO_SNAP_MAX はconstants.tsへ。
  pnpm test && pnpm lint で確認。
  目標: 20個削減
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
