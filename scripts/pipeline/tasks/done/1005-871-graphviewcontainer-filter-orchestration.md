---
priority: high
reported: 2026-04-19
status: done
source: decomposed
parent: 871-747-subtask
depends: subtask-2
summary: GraphViewContainer から filter orchestration を抽出
---

## Description (subtask of 871-747-subtask)

getGraphData 周辺のフィルタ合成 (showOrphans / existingOnly / tag filter / searchQuery の順序制御) を src/views/filter-orchestrator.ts に純粋関数として抽出する。
  - MEMORY.md 記載の8段パイプラインの実行順序を変更しないこと
  - GraphViewContainer からは orchestrator 1回呼び出しに置換
  - tests/views/filter-orchestrator.test.ts に順序性テスト・空入力・search 失敗時ガード
  - CLAUDE.md の Max Allowed を ratchet down
  - pnpm test / pnpm lint / pnpm build 全通過を確認

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
