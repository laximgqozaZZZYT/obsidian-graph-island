## Description (subtask of 139-e2e-smoke-fail)

`e2e/smoke.spec.ts` の `beforeAll` で計算される BASELINE が 2000 を下回る原因を特定する。
  - `src/views/GraphViewContainer.ts` の `getGraphData()` 入口に、フィルタパイプライン各段階(rawData→showOrphans→existingOnly→tagFilter→search→groupBy collapse)の `nodes.length` を `[graph-island][diag]` プレフィックス付きで `console.log` 出力する診断ブロックを追加する。`screenshotMode` と同様、`process.env.NODE_ENV !== 'production'` または `(window as any).__GI_DIAG__ === true` で gate する（プロダクションビルドで esbuild が drop する）。
  - `src/parsers/metadata-parser.ts` の `buildGraphFromVault()` 戻り値直前に、生成された `nodes.length` / `edges.length` を同形式で出力する。
  - 既存ロジックを変更しない（観測のみ）。GOD OBJECT 行数制限を超えないこと（10行未満で収める）。
  - 追加後、ローカルで `pnpm build` → vault にデプロイ → CDP devtools コンソールで `__GI_DIAG__ = true` を設定 → smoke test 実行 → コンソールログから「どの段階で nodes が 2000 を下回るか」を特定し、コミットメッセージに記録する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
