---
priority: high
reported: 2026-04-19
status: pending
source: decomposed
parent: 1149-139-baseline-node-count-2000
depends: none
summary: getGraphData() の各パイプライン段階に一時的な nodeCount トレースログを追加
---

## Description (subtask of 1149-139-baseline-node-count-2000)

`getGraphData()` 内の各フィルタ段階 (rawData / showOrphans後 / existingOnly後 / tag filter後 / searchQuery後 / groupCollapse後) の直後に
  `console.debug('[nodecount-trace] stage=<name> nodes=<n> edges=<m>')` を一時的に挿入する。
  ブランチ名: `investigate/139-1-nodecount-trace`。
  ビルド (`pnpm build`) と `pnpm lint` が通ることを確認してコミット。本番ビルドでは esbuild が console.debug を drop するため影響なし。
  God Object 上限 8580 行を超えないように注意 (追加は10行未満で収まるはず)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
