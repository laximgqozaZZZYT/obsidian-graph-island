---
priority: medium
reported: 2026-04-10
status: in-progress
source: decomposed
parent: 058-slow-loading
depends: none
summary: subtask
---

## Description (subtask of 058-slow-loading)

十分な情報が集まりました。コードの構造を理解した上で、タスク分解を行います。

`★ Insight ─────────────────────────────────────`
**ボトルネック候補の分析:**
1. `buildGraphFromVault()` は5フェーズを**全て同期的**に実行。特に `createFileNodes()` で全ファイルに対し `cachedRead()` + `defineLiveMeta()` (Object.defineProperty) を呼び、`buildEdgesFromLinks()` でも全ファイルを再走査している
2. `onOpen()` は `doRender()` を同期的に呼び、その中で `getGraphData()` → `buildGraphFromVault()` が走る。UIスレッドをブロックする
3. `defineLiveMeta()` は各ノードにgetter付きプロパティを定義 — 2232ノード×Object.defineProperty は初期化コストが高い
4. `collectInlineRelations()` で全ファイルに対し `cachedRead()` を再度呼んでいる（Phase 1とPhase 3で二重読み）
`─────────────────────────────────────────────────`

---

## タスク分解結果

```

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
