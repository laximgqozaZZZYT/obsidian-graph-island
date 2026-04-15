---
priority: medium
reported: 2026-04-16
status: pending
source: decomposed
parent: 269-247-224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: subtask
---

## Description (subtask of 269-247-224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

状況を把握しました。`PanelBuilder.ts` から `as HTMLElement` は既に全て除去されています。残っている `as` は29箇所で、大半は `as const`（安全）です。実際に型安全性リスクがあるのは数箇所のみです。

---

**このissueは実質完了済みです。**

親issue（`panelbuilder-ts-as-htmlelement`）の目標である `as HTMLElement` の除去は既に達成されています。

残っている `as` の内訳:
- **`as const`**: 11箇所 — TypeScript イディオム、安全、変更不要
- **`import as alias`**: 5箇所 — モジュールリネーム、変更不要
- **コメント内 "as"**: 3箇所 — コード外、変更不要
- **要改善**: 4箇所のみ（下記）

改善対象が4箇所と少ないため、**1タスクで十分**です:

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
