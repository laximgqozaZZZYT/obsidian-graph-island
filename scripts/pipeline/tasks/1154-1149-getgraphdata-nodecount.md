---
priority: high
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1149-139-baseline-node-count-2000
depends: none
summary: getGraphData() 各段階の nodeCount トレース (詳細は子タスク 1157 参照)
---

## Description (subtask of 1149-139-baseline-node-count-2000)

`getGraphData()` パイプライン各段階 (rawData / afterShowOrphans / afterExistingOnly / afterTagFilter / afterSearchQuery / afterGroupCollapse) の nodeCount / edgeCount を計測する。

実装詳細は子タスクへ委譲 (当初案の `console.debug` 挿入は CLAUDE.md `Forbidden Patterns` および `GOD OBJECT Policy` に抵触するため CDP eval 方式に変更):

- `1157-1154-getgraphdata-nodecount.md` — CDP eval (E2E) による外部計測。`src/` 無変更。

## Acceptance criteria

- [ ] 子タスク 1157 が完了していること。
