## Description (subtask of 1324-dead-exports)

1. `pnpm dlx ts-prune --error` または `pnpm dlx knip` を実行し、現在の dead export 一覧 (111件想定) を取得する。
  2. 出力を `docs/dead-exports-report.md` に保存し、ファイル別件数と「テストでのみ使用」「完全未使用」を区別する。
  3. `src/utils/` 配下の dead export を対象に、以下を実施 (最低30件):
     - `grep -r "exportName" src/ tests/` で参照確認
     - 完全未使用 → 関数本体ごと削除
     - テストのみ参照 → テスト側も削除を検討、または `export` キーワードを外す
  4. `pnpm test` と `pnpm lint` がグリーンであること、`pnpm build` でバンドルサイズが 800KB 以下を維持していることを確認。
  5. 削除した件数を report に追記。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
