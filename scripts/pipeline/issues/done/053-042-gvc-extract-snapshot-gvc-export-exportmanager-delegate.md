---
priority: high
reported: 2026-04-07
status: done
source: decomposed
parent: 042-gvc-extract-snapshot
depends: none
summary: GVC の export メソッド群を ExportManager への delegate に置換
---

## Description (subtask of 042-gvc-extract-snapshot)

ExportManager.ts に既に同等の関数が存在するため、GVC の以下の8メソッドを
  ExportManager の関数呼び出しに置き換える (this を ExportHost として渡す):
  
  - exportSubgraph(nodeId) → ExportManager.exportSubgraph(this, nodeId)
  - exportPng() → ExportManager.exportPng(this)
  - exportFullGraph() → ExportManager.exportFullGraph(this)
  - exportGraphAsCSV() → ExportManager.exportGraphAsCSV(this)
  - exportGraphAsMermaid() → ExportManager.exportGraphAsMermaid(this)
  - copyGraphToClipboard() → ExportManager.copyGraphToClipboard(this)
  - embedGraphInNote() → ExportManager.embedGraphInNote(this)
  - exportCanvasAsBlob() → ExportManager.exportCanvasAsBlob(this)
  
  各メソッドを1-3行の delegate に縮小する。
  GVC の不要になった import (exportSubgraphJSON, exportFullGraphJSON,
  exportGraphCSV, exportGraphMermaid, collectSubgraph, captureSnapshot の
  うち export 系のみ) を削除。
  
  ExportHost インターフェースに不足があれば ExportManager.ts 側を調整。
  TOAST_SHORT_MS/TOAST_MEDIUM_MS/TOAST_LONG_MS 等の定数は ExportManager 内で
  直接使う (現在ハードコードされている数値を定数化するなら ExportManager 側で)。
  
  期待される GVC 行数削減: 約150-170行
```

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
