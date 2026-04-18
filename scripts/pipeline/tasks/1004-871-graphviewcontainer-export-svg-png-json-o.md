---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 871-747-subtask
depends: subtask-1
summary: GraphViewContainer から export(SVG/PNG/JSON) orchestration を抽出
---

## Description (subtask of 871-747-subtask)

エクスポート関連の orchestration (SVG/PNG/JSON 書き出し、ファイル名生成、options 解決) を src/views/export-orchestrator.ts に抽出する。
  - 対象: _exportSVG / _exportPNG / _exportJSON の orchestration 部 (既存 exportGraphSVG は触らない)
  - GraphViewContainer からは委譲のみ残す
  - tests/views/export-orchestrator.test.ts を新設 (options merge, filename 生成, 空グラフ境界値)
  - CLAUDE.md の Max Allowed を更新後の行数に ratchet down
  - pnpm test / pnpm lint / pnpm build 全通過を確認

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
