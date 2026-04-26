## Description (subtask of 1261-i18n-hardcoded-strings)

subtask-1 で特定したキーを src/i18n.ts の en/ja 両セクションに追加する。
  PanelBuilder.ts 関連の `setText()`/`textContent` 直接代入を t('key') に置換する。
  PanelBuilder.ts は GOD OBJECT なので行数を増やさないこと
  (置換のみ、新規ロジック追加禁止)。
  対応するテスト (tests/views/panel-*.test.ts があれば) を更新し、
  pnpm test と pnpm lint を実行してパスを確認する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
