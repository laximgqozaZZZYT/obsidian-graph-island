---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 624-607-4-god-object
depends: none
summary: 4つのGod Objectファイルの行数を wc -l で計測
---

## Description (subtask of 624-607-4-god-object)

以下コマンドを実行して、4ファイルの現在行数を取得する:
    wc -l src/views/GraphViewContainer.ts src/views/PanelBuilder.ts src/views/EdgeRenderer.ts src/views/RenderPipeline.ts

  取得した数値を一時ファイル（例: /tmp/god-object-measurement-2026-04-18.txt）に保存し、4ファイルすべての行数が取得できたことを確認する。
  コード変更・テスト変更は一切発生しない (read-only)。diffは空のまま完了。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
