---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 654-635-subtask
depends: none
summary: 4つのGod Objectファイルの行数を `wc -l` で計測し記録する
---

## Description (subtask of 654-635-subtask)

CLAUDE.md の GOD OBJECT Policy テーブルに記載された4ファイルの現在行数を `wc -l` で計測する。

  実施内容:
  1. `wc -l src/views/GraphViewContainer.ts src/views/PanelBuilder.ts src/views/EdgeRenderer.ts src/views/RenderPipeline.ts` を実行
  2. 結果を CLAUDE.md の「Max Allowed」値と比較（GraphViewContainer:8597, PanelBuilder:2216, EdgeRenderer:2702, RenderPipeline:2321）
  3. いずれかが Max Allowed を超えていれば CRITICAL として報告
  4. 計測結果を本タスクのコミットメッセージに記録（例: `chore: measure god object line counts (GVC=N, PB=N, ER=N, RP=N)`）

  制約:
  - ファイル編集は行わない（read-only 計測のみ）
  - CLAUDE.md の Max Allowed 値自体は変更しない（ラチェットダウンは別タスク）
  - コードの変更を伴わないため、`pnpm test` / `pnpm lint` の実行は不要

  完了条件:
  - 4ファイルの行数が記録され、Max Allowed との比較結果がコミットメッセージまたはタスク done ログに残る

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
