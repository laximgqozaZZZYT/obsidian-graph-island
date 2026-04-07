---
priority: high
reported: 2026-04-07
status: done
source: decomposed
parent: 042-gvc-extract-snapshot
depends: subtask-1
summary: ExportManager のユニットテスト追加 (最低5ケース)
---

## Description (subtask of 042-gvc-extract-snapshot)

ExportManager.ts の抽出済み関数に対するユニットテストを追加。
  
  テストケース (最低5):
  1. downloadFile — Blob生成とリンク作成の確認 (DOM mock)
  2. exportSubgraph — adj/edges null ガードの確認
  3. exportFullGraph — getGraphData 呼び出しと downloadFile の確認
  4. exportGraphAsCSV — CSV出力と downloadFile の確認
  5. exportGraphAsMermaid — clipboard 成功時/失敗時の分岐
  6. copyGraphToClipboard — pixiApp null ガード
  7. exportCanvasAsBlob — pixiApp null 時に null 返却
  
  mock: ExportHost を最小限のスタブで実装。
  Notice, navigator.clipboard は vi.fn() で mock。
```

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
