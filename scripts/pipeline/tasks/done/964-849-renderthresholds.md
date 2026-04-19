---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 849-734-subtask
depends: none
summary: ハードコード閾値 (RenderThresholds 経由でない数値) を検出
---

## Description (subtask of 849-734-subtask)

対象ファイル (layouts/, RenderPipeline, EdgeRenderer) で以下を Grep:
  - `if.*[<>]=?\s*\d{2,}` (2桁以上のマジックナンバー比較)
  - `const\s+\w+\s*=\s*\d{2,}` (定数宣言)
  ただし `RenderThresholds.` を含む行、`// eslint-disable` がある行、`*=` などの乗算、index (0,1,-1)、色値 (0xFFFFFF 等) は除外。
  検出分は `file:line: 数値` 形式で issue 報告。0件なら PASS。コード変更なし。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
