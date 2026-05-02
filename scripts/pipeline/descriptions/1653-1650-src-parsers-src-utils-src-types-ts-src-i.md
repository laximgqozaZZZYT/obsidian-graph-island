## Description (subtask of 1650-dead-exports)

`pnpm exec ts-prune` の出力から src/parsers/, src/utils/, src/types.ts, src/i18n.ts に該当する行を抽出し、
  各 dead export を:
  - 完全に未使用 → 関数/型/定数を削除
  - 同一ファイル内のみで使用 → `export` キーワードを外す
  に分類して対応する。
  src/types.ts では interface/type が他ファイルで本当に未使用かを `grep -r "TypeName" src/ tests/` で
  二重確認してから削除する (型は ts-prune が誤検出する場合がある)。
  i18n.ts のキーは `t('key')` 文字列での参照を grep で確認すること。
  完了後 `pnpm exec ts-prune | wc -l` で残数を計測し PR 説明に記載する。
  `pnpm test`, `pnpm lint`, `pnpm build` を通すこと。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
