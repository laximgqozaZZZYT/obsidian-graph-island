---
priority: high
reported: 2026-04-24
status: done
source: decomposed
parent: 144-coverage-drop
depends: none
summary: panel-sections-filter のセクションビルダーにテストを追加
---

## Description (subtask of 144-coverage-drop)

`src/views/panel-sections-filter.ts` は 12 個の `build*Section(...)` 関数があり 41.8% カバレッジ。
  `tests/panel-sections-filter.test.ts` を作成し、各ビルダー関数に対して:
  - 返り値の DOM 構造（最低限の HTMLElement/子要素数/期待されるクラス名）
  - 設定オブジェクトの代表的な値（default / toggled / disabled）でのスナップショット的検証
  - コールバックが正しくフックされているか（onChange 相当を手動で呼び出してスパイ確認）
  `tests/__mocks__/obsidian.ts` の既存 mock を利用。container 要素は `document.createElement("div")` を使う。
  優先は `buildBookmarkSection`/`buildHoverBehaviorSection`/`buildNodeDisplayModeSection`/`buildNodeDecorationSection` の 4 つ。
  目標: 15テストケース、このファイル stmts 41.8%→65%+。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
