## Description (subtask of 1688-dead-exports)

`node scripts/list-dead-exports.mjs` を実行して `tmp/dead-exports-report.md`
  を生成し、Category C (完全未使用 — どこからも参照されていない export)
  の symbol を削除する。

  対象は report の "Category C — completely unused (deletion candidate)"
  セクションに列挙された 151 件 (src/views ~86, src/constants.ts ~45,
  src/utils ~10, src/layouts ~10)。

  手順:
  1. `node scripts/list-dead-exports.mjs` で最新レポート生成
  2. Category C テーブルの各 (file, line, symbol) を該当ファイルから削除
  3. 削除前に `grep -rn "<symbol>" src tests` で本当に未参照か再確認
     (ts-prune の誤検知ガード)
  4. 関数/定数の本体 + 型 import が他で使われていなければ片付け
  5. `pnpm build && pnpm test && pnpm lint` でグリーン確認
  6. 再度 `node scripts/list-dead-exports.mjs` を実行し総数が減ったことを確認

  GOD OBJECT (GraphViewContainer.ts 等) からの削除は許可
  (ratchet 行数が下がる方向なので歓迎)。新規ファイル作成・新規 export 追加は禁止。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
