---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 623-607-subtask
depends: none
summary: 4つのGod Objectファイルの行数を確認し、Max Allowed超過がないか検証
---

## Description (subtask of 623-607-subtask)

CLAUDE.md の GOD OBJECT Policy 表に記載された4ファイルの現在行数を `wc -l` で計測し、
  Max Allowed 値（それぞれ 8597 / 2216 / 2702 / 2321）を超過していないことを確認する。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts src/views/PanelBuilder.ts src/views/EdgeRenderer.ts src/views/RenderPipeline.ts` 実行
  2. 各ファイルの行数を CLAUDE.md の表と比較
  3. 超過ファイルがあれば該当を報告（ラチェット違反として issue 化）
  4. 超過がなければ、現在値が Max Allowed より減っているファイルを特定し、
     CLAUDE.md の表を現在値にラチェットダウン更新（減少方向のみ）
  5. `pnpm lint` `pnpm test` `pnpm build` で既存ゲート通過を確認
  6. CLAUDE.md 更新があればコミット「chore: ratchet down god object line limits」

  コード変更は CLAUDE.md のみ。ソースファイルの実装には触れない。
  Max Allowed を増やす方向への更新は禁止（CLAUDE.md の Forbidden Patterns 違反）。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
