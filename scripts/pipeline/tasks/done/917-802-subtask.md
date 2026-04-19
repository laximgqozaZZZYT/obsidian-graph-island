---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 802-769-subtask
depends: none
summary: subtask
---

## Description (subtask of 802-769-subtask)

`★ Insight ─────────────────────────────────────`
このissueは既に末端サブタスク(decomposed source)で、`git status --short`の生出力取得という単一操作に絞られています。過剰分解は避けつつ、「実行関数」と「テスト」の2タスクに分けることでパイプラインの失敗箇所を特定しやすくします。Obsidian pluginコンテキストでは`child_process`が使えないため、`app.vault.adapter`経由のGit統合（もしくは外部プラグインAPI）前提の設計になります。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
