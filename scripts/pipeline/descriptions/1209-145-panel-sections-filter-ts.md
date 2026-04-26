
## Description (subtask of 145-coverage-drop)

src/views/panel-sections-filter.ts (現在 stmt 41.8% / fn 25.7%, 199行未カバー) から
  フィルタ条件評価・選択肢列挙などの DOM 非依存ロジックを
  新規ファイル src/views/panel-sections-filter-logic.ts に抽出。
  - 抽出対象: タグ候補の列挙、フィルタ値の正規化、有効フィルタ件数のカウント、クエリ式の事前検証
  - panel-sections-filter.ts は DOM 組み立てのみに専念（行数減）
  - tests/views/panel-sections-filter-logic.test.ts に12件以上テスト
    - 空入力、全選択、部分選択、重複除去
    - クエリ式の妥当性検証（query-expr との統合）
    - 大文字小文字正規化
  - God Object 肥大化禁止、i18n キーはそのまま保持

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
