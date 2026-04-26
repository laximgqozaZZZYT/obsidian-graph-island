## Description (subtask of 065-e2e-smoke-fail)

e2e/smoke.spec.ts:87 の `1-Data › baseline node count > 2000` 失敗を調査して修正する。
  手順:
  1. e2e/smoke.spec.ts の 87 行目周辺を読んで、何のノード数を測定しているか (pixiNodes の数 / rawData / getGraphData 後 のどれか) を特定する。
  2. 開発 vault は 2232 markdown files。期待値 2000 は妥当。実測値が 2000 を下回っている原因を CDP で確認する候補:
     - showOrphans / existingOnly / includeTagsInData などのデフォルト設定変更で除外された
     - buildGraphFromVault のフィルタ変更で件数が減った
     - groupBy auto-collapse が走って表示ノード数が減っている (この場合テスト側の取得対象を rawData にする必要がある)
  3. 原因に応じて、src/parsers/metadata-parser.ts もしくは src/views/GraphViewContainer.ts のフィルタロジックを修正するか、テスト側の測定対象 (rawData ベースに変える等) を修正する。
  4. ローカルで `pnpm test:e2e -- e2e/smoke.spec.ts -g "baseline node count"` を実行して PASS を確認する。
  CLAUDE.md の GOD OBJECT ポリシー遵守: GraphViewContainer.ts は 8655 行を超えないこと。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
