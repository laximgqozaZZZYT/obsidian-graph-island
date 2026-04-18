---
priority: high
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 606-596-issue
depends: none
summary: GraphViewContainer.ts 行数確認と次issue番号決定
---

## Description (subtask of 606-596-issue)

`src/views/GraphViewContainer.ts` の行数を `wc -l` で取得し、8597 行超過かを判定するスクリプトを作成（または既存スクリプトで確認）。
  超過していない場合は 0 を返して終了（issue 作成不要）。
  超過している場合:
  - 実測行数 N を記録
  - `issues/` 配下の既存ファイル名から最大連番を取得し、次の連番を決定
  - 出力: 超過行数、次連番、ファイル名候補（例: `611-598-graphviewcontainer-ts-over-limit.md`）
  このタスクでは issue ファイルの作成は行わず、判定と準備のみ。結果を stdout に出力する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
