## Description (subtask of 1664-dead-exports)

scripts/list-dead-exports.mjs を実行して tmp/dead-exports-report.md を生成し、
  Category C の `src/constants.ts` 配下 45 件の export を以下手順で削除する:
  1. 各シンボルについて `grep -r "シンボル名" src/ tests/` で参照ゼロを確認
  2. 参照ゼロのものは export 宣言ごと削除（残された定義は不要なら削除、必要なら export を外す）
  3. `pnpm build` と `pnpm test` を実行して回帰なしを確認
  4. `node scripts/list-dead-exports.mjs` を再実行して件数減少を確認
  対象ファイルは単一なので Edit 1ファイルで完結する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
