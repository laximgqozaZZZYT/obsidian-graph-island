---
priority: medium
reported: 2026-04-16
status: pending
source: decomposed
parent: 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: subtask
---

## Description (subtask of 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

残りの `as HTMLElement` 型アサーション箇所を把握しました。全30+箇所あり、ファイル別にグループ化して分解します。

`★ Insight ─────────────────────────────────────`
`as HTMLElement` は DOM API の `querySelector` や `children` がより広い型（`Element | null`）を返すため多用されがちですが、`instanceof` ガードや型述語関数に置き換えることで実行時安全性が向上します。God Objectファイルは行数を増やせないため、ヘルパー関数の抽出先を慎重に選ぶ必要があります。
`─────────────────────────────────────────────────`

以下がタスク分解です。

---

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
