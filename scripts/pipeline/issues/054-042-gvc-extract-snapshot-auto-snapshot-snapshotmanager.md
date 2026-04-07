---
priority: high
reported: 2026-04-07
status: in-progress
source: decomposed
parent: 042-gvc-extract-snapshot
depends: subtask-1
summary: Auto-snapshot ロジックを SnapshotManager に抽出
---

## Description (subtask of 042-gvc-extract-snapshot)

GVC 1584-1622行の auto-snapshot ブロックを新ファイル
  src/views/SnapshotManager.ts に抽出する。
  
  SnapshotHost インターフェースを定義:
  - plugin: { settings: { snapshots, autoSnapshotIntervalMin }, saveSettings() }
  - pixiNodes: Map<string, unknown>
  - getGraphData(): GraphData
  - currentLayout: string | null
  - panel: { searchQuery, clusterGroupRules }
  
  export function setupAutoSnapshot(host: SnapshotHost, registerEvent: ...) を
  作成し、GVC の onOpen 内でこの関数を呼び出すように置換。
  
  期待される GVC 行数削減: 約35-40行
```

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
