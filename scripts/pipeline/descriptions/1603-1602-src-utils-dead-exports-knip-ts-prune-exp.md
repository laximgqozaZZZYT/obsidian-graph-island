## Description (subtask of 1602-dead-exports)

pnpm dlx knip --include exports または pnpm dlx ts-prune を実行して
  src/utils/ 配下の dead exports を一覧化する。
  各 dead export について以下を判断:
    - 完全未使用 → 関数/型ごと削除
    - テストのみで使用 → そのまま残し、本番コードからの参照を確認
    - import 漏れ疑い → grep で実際の参照を確認後に判断
  godobj ファイル (GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts,
  RenderPipeline.ts) は触らない (extract task と衝突するため)。
  pnpm test と pnpm lint が通ることを確認してコミットする。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
