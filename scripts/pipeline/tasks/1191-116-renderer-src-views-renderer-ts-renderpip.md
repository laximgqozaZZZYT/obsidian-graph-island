---
priority: high
reported: 2026-04-24
status: in-progress
source: decomposed
parent: 116-scattered-constants
depends: subtask-1
summary: Renderer系 (src/views/*Renderer*.ts, RenderPipeline.ts) のSCREAMING_CASE定数を集約
---

## Description (subtask of 116-scattered-constants)

EdgeRenderer.ts / RenderPipeline.ts / NodeRenderer.ts / LabelManager.ts の
  SCREAMING_CASE 定数を constants.ts の `// === Render Constants ===` セクションに集約。
  GOD OBJECT ファイル (EdgeRenderer 2702行, RenderPipeline 2321行) は
  定数定義を削除する分だけ行数が減るので問題ないが、Max Allowed を超えないこと。
  最低70個以上の定数を移動。ユニットテストとバンドルサイズ (≤800KB) を確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
