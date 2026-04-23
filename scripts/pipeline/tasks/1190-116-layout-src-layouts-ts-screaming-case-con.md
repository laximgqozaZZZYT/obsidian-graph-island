---
priority: high
reported: 2026-04-24
status: in-progress
source: decomposed
parent: 116-scattered-constants
depends: none
summary: Layout系ファイル (src/layouts/*.ts) のSCREAMING_CASE定数をconstants.tsへ集約
---

## Description (subtask of 116-scattered-constants)

src/layouts/ 配下の *.ts ファイルから SCREAMING_CASE の const 定義を抽出し、
  src/constants.ts の新セクション `// === Layout Constants ===` 配下に移動する。
  各ファイルは constants.ts から import して参照する形に書き換える。
  移動対象は最低80個以上の定数。既存テスト (pnpm test) がグリーンであることを確認。
  ファイル行数を増やさない (import 追加 = export 削除で相殺)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
