---
priority: medium
reported: 2026-04-24
status: in-progress
source: decomposed
parent: 141-coverage-drop
depends: none
summary: tag-relation-presets.ts detectTagRelations テスト追加
---

## Description (subtask of 141-coverage-drop)

`src/utils/tag-relation-presets.ts` の `detectTagRelations(app)` は既テストがあるが未到達分岐が残っている想定。
  `tests/__mocks__/obsidian.ts` の App mock を拡張しつつ以下ケースを追加:
  - vault にタグ無しファイルのみ → 空配列
  - 単一ファイルに複数タグ → co-occurrence 1 件
  - 同じタグペアが複数ファイルで出現 → count 集計
  - 大文字小文字・`#` 有無の正規化
  新規 export は追加せず、既存関数の呼び残し分岐のみテストする。
  完了後 `pnpm test:coverage` でしきい値 (52.3 / 46.5 / 50.4 / 52.5) を超えたか検証する手順を description に含めること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
