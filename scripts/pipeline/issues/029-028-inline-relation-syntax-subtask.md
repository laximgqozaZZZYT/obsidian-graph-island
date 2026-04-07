---
priority: medium
reported: 2026-04-07
status: in-progress
source: decomposed
parent: 028-inline-relation-syntax
depends: none
summary: subtask
---

## Description (subtask of 028-inline-relation-syntax)

十分に構造を把握できました。以下がタスク分解です。

---

`★ Insight ─────────────────────────────────────`
**既存実装との関係**: `parseInlineRelationLinksRaw` (`metadata-parser.ts:692`) が既に `[[note|alias]@relation]` をパースしており、正規表現 `/\[\[([^\]|]+)(?:\|[^\]]*)?\]@([^\]]+)\]/g` が存在します。現状これらは `resolveRelationEdge` → ontology未分類 → `semantic` タイプにフォールバックしています。つまり **パーサーは既存**で、必要なのは「独立したedge type化 + UIトグル + フィルタ」です。

**EdgeRenderer の拡張パターン**: `EDGE_TYPE_SPECS` Map にエントリを追加するだけで `shouldSkipEdge` が自動的に新タイプを処理します。`visibilityField` を指定すれば `EdgeDrawConfig` の対応フィールドを参照します。
`─────────────────────────────────────────────────`

---

## タスク分解

###

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
