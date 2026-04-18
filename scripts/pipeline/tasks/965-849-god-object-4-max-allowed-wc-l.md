---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 849-734-subtask
depends: none
summary: God Object 4ファイルが Max Allowed を超えていないか wc -l で検証
---

## Description (subtask of 849-734-subtask)

Bash で `wc -l` を実行:
  - `src/views/GraphViewContainer.ts` ≤ 8597
  - `src/views/PanelBuilder.ts` ≤ 2216
  - `src/views/EdgeRenderer.ts` ≤ 2702
  - `src/views/RenderPipeline.ts` ≤ 2321
  超過があれば issue 形式で差分行数を報告。全 PASS なら `PASS: God Object 全ファイル Max Allowed 以内` をログ出力。コード変更なし。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
