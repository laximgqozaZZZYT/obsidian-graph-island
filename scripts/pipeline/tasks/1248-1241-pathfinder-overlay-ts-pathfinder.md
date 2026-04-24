---
priority: high
reported: 2026-04-25
status: pending
source: decomposed
parent: 1241-1237-pathfinder-overlay-ts-pathfinder-import
depends: subtask-1
summary: pathfinder-overlay.ts 内のインラインリテラルを PATHFINDER_ 定数参照へ置換する
---

## Description (subtask of 1241-1237-pathfinder-overlay-ts-pathfinder-import)

1. subtask-1 で列挙した置換候補箇所を、1 箇所ずつ Edit で定数参照に置換する。
  2. 各 Edit 前に該当行と前後数行を Read で再確認し、同じ数値が別の意味で使われていないか文脈判断する。疑わしい箇所は置換せずスキップする。
  3. ズーム閾値・LOD 閾値・密度スケール係数のリテラルは置換しない。意図的にインラインのまま残す箇所には `// zoom-adaptive, intentionally inline` 等の 1 行注釈を付けてよい（必要最小限）。
  4. 禁止ファイルに触らない: `src/views/EdgeRenderer.ts`, `src/views/RenderPipeline.ts`, `src/views/node-decorations.ts`。
  5. lint/test はこの subtask では実施しない（親タスクの別 subtask で実施予定）。
  6. 変更をコミットする。コミットメッセージ例: `refactor(pathfinder-overlay): replace inline literals with PATHFINDER_* constants`。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
