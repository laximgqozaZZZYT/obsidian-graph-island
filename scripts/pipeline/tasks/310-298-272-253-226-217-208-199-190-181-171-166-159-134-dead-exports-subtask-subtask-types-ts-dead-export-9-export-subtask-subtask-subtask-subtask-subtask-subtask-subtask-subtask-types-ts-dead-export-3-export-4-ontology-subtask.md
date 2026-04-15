---
priority: medium
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 298-272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-types-ts-dead-export-3-export-4-ontology
depends: none
summary: subtask
---

## Description (subtask of 298-272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-types-ts-dead-export-3-export-4-ontology)

3つとも `src/types.ts` 外から import されているため、**dead export ではありません**。`SortKey` は3ファイル、`SortOrder` は2ファイル、`OntologyRule` は1ファイルから import されています。

export を削除するとビルドが壊れます。このタスクは **実行不可** です。

---

親タスクの前提が誤っている可能性があります。選択肢:

1. **このタスクをスキップ（推奨）** — 3つとも実際に使われている export なので、削除は不適切
2. **親タスクに差し戻し** — dead export リストの再調査が必要

どちらにしますか？

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
