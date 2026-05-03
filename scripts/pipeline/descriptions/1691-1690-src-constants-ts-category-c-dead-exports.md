## Description (subtask of 1690-dead-exports)

`tmp/dead-exports-report.md` の Category C 行のうち `src/constants.ts` に
  該当する 45 シンボルを削除する。
  手順:
  1. `node scripts/list-dead-exports.mjs` を実行して最新レポートを生成
  2. レポート内 Category C で File が `src/constants.ts` の行をすべて抽出
  3. 各シンボルが以下のいずれにも該当しないことを `pnpm exec grep -r "シンボル名" src/ tests/`
     で確認 (i18n キー文字列、動的アクセス、再export経由の利用)
  4. 該当する `export const` / `export function` / `export type` 宣言を削除
  5. `pnpm build && pnpm lint && pnpm test` を通す
  6. 再度 `node scripts/list-dead-exports.mjs` を実行し Category C の総数が
     151 から 45 件減って 106 件以下になっていることを確認

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
