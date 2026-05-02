## Description (subtask of 1580-dead-exports)

`node scripts/list-dead-exports.mjs` を実行し `tmp/dead-exports-report.md` で
  `src/constants.ts` の Category B / C エントリ (合計 45 件) を特定する。
  - Category C (完全未使用、約 45 件): 該当する `export const`/`export function`/`export type` を削除する。
  - Category B (同一モジュール内のみ参照、もしあれば): `export` キーワードのみ削除し、宣言は残す。
  作業手順:
  1. `pnpm test` を実行してベースラインがグリーンであることを確認。
  2. `tmp/dead-exports-report.md` を読み、`src/constants.ts` 行のシンボル一覧を抽出。
  3. 各シンボルを `grep -rn "シンボル名" src/ tests/` で再検証 (誤検出回避)。
  4. Category C は宣言を削除、Category B は `export` のみ削除。
  5. `pnpm build && pnpm test && pnpm lint` 全てグリーンを確認。
  6. `node scripts/list-dead-exports.mjs` を再実行し、constants.ts のエントリが 0 件に近いことを確認。
  禁止事項: 機能変更/リネーム/移動。純粋に宣言の削除と `export` 除去のみ。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
