
## Description (subtask of 141-coverage-drop)

`src/utils/filter-match.ts` は現状どのテストからも import されておらず、`matchesFilter` (唯一の export) が未カバー。
  `tests/filter-match.test.ts` を新規作成し、以下の分岐を最低限カバーする:
  - `filter === "*"` で常に true
  - `tag:<name>` マッチ/非マッチ
  - `category:<name>` マッチ/非マッチ
  - `label:<substr>` の部分一致
  - `isTag` フラグ
  - 未知フィルタ文字列 → タグ名として解釈
  - 空文字列・パース不能文字列のフォールバック
  - 内部 `_exprCache` のヒット (同一 filter を 2 回呼ぶ)
  GraphNode mock は `tests/__mocks__` 流用、または最小オブジェクトリテラル。
  コミットメッセージ例: `test: cover filter-match pure helper`.

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
