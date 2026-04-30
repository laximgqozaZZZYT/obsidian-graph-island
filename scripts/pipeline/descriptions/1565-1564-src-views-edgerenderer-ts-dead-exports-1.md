## Description (subtask of 1564-dead-exports)

`node scripts/check-dead-exports.mjs` の出力で src/views/EdgeRenderer.ts に 11個の dead exports が計上されている (実測値、2026-04-30)。
  各シンボルについて以下の手順で処理する:
  1. `Grep` で tests/ 配下からの参照を確認
     - tests からのみ参照される場合 → export 保持(ts-prune A 相当)
     - 同モジュール内のみ使用 → `export` キーワードを削除してローカル化
     - 完全未参照 → シンボル定義ごと削除
  2. EdgeRenderer.ts は CLAUDE.md の god object 4ファイルの1つ (Max Allowed=2765行)。
     export 削除はファイル行数を増やさないので Forbidden Pattern に該当しない。
     シンボル削除を伴う場合のみ、変更後行数を `wc -l` で確認すること。
  3. `pnpm test` で関連 unit test が PASS すること。`pnpm lint` で警告なきこと。
  完了条件: `node scripts/check-dead-exports.mjs` の出力で src/views/EdgeRenderer.ts のカウントが 11 → 0 になっていること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
