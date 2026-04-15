---
priority: medium
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 166-159-134-dead-exports-subtask-subtask
depends: none
summary: subtask
---

## Description (subtask of 166-159-134-dead-exports-subtask-subtask)

現状を把握しました。以下がタスク分解結果です。

---

## タスク分解結果

このissue（166）とその親（159）は、いずれもパイプライン実行エラー（API 500 / max-turns到達）の記録であり、実際のコード変更タスクを含んでいません。本来の親issueは **134-dead-exports**（57個→50個以下に削減）です。

現在のdead exportsは **22個** で、既に目標（50個以下）を達成しています。ただし残り22個も安全に削減可能なため、以下に分解します。

---

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
