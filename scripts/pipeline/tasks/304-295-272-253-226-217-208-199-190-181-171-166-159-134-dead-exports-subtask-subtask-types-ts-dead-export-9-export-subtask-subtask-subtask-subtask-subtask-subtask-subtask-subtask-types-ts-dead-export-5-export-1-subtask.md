---
priority: medium
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 295-272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-types-ts-dead-export-5-export-1
depends: none
summary: subtask
---

## Description (subtask of 295-272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-types-ts-dead-export-5-export-1)

5つ全てが外部ファイルからimportされ使用されています。これらは「dead export」ではなく**実際に使われている型**です。

`★ Insight ─────────────────────────────────────`
- `ClusterGroupArrangement` → 4ファイルからimport（PanelBuilder, panel-sections-layout, panel-defaults）
- `ClusterGroupBy` → panel-widgets.ts からimport + types.ts内部で使用
- `CoordinateSystem` → coordinate-engine.ts, panel-sections-layout.ts からimport
- `GridShape` → coordinate-engine.ts からimport
- `GridStyle` → coordinate-engine.ts からimport

全5型が外部モジュールからimportされており、exportを削除するとビルドエラーになります。
`─────────────────────────────────────────────────`

## 分解結果

このタスクは**1サブタスクで完了**します。5型全てが外部参照されているため、export削除→ビルド確認→エラー→元に戻す、というサイクルになります。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
