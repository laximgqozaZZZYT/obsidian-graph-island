---
priority: medium
reported: 2026-04-07
status: pending
source: decomposed
parent: 042-gvc-extract-snapshot
depends: none
summary: subtask
---

## Description (subtask of 042-gvc-extract-snapshot)

現状を整理しました。重要な発見:

- **ExportManager.ts が既に存在** — GVC のエクスポート関数が既に抽出済み
- **GVC にはまだ重複実装が残っている** — `exportSubgraph`, `exportPng`, `exportFullGraph`, `exportGraphAsCSV`, `exportGraphAsMermaid`, `copyGraphToClipboard`, `embedGraphInNote`, `exportCanvasAsBlob` (8メソッド、約180行)
- **Auto-snapshot ロジック** (1584-1622行、約40行) も GVC 内に残存
- **テストファイルは ExportManager 用も snapshot 用も未確認** (既存テストなし)

`★ Insight ─────────────────────────────────────`
ExportManager.ts は既に Host パターン（インターフェース経由の依存注入）で抽出済みだが、GVC 側のメソッドがまだ delegate せず重複コードを保持している。この「抽出したのに delegate してない」状態は、リファクタの第2段階（呼び出し元の書き換え）が未完了であることを示す。
`─────────────────────────────────────────────────`

---

以下がタスク分解です。

---

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
