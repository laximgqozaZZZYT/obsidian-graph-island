---
priority: high
reported: 2026-04-24
status: done
source: decomposed
parent: 145-coverage-drop
depends: none
summary: panel-sections-layout.ts のオプション算出ロジックを純粋関数化しテスト
---

## Description (subtask of 145-coverage-drop)

src/views/panel-sections-layout.ts (現在 stmt 52% / fn 43.8%, 168行未カバー) から
  DOM 非依存のロジックを新規ファイル src/views/panel-sections-layout-logic.ts に抽出。
  - 抽出対象: 選択可能レイアウト一覧のフィルタリング、レイアウト互換性チェック、デフォルト値の決定関数
  - panel-sections-layout.ts 側は DOM 組み立てのみに専念（行数減）
  - tests/views/panel-sections-layout-logic.test.ts に10件以上テスト追加
    - 各 ViewMode × LayoutAlgorithm の互換性マトリクス検証
    - 設定値のデフォルト決定ロジック境界値
  - HTMLElement や DocumentFragment を参照する関数はテスト対象外

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
