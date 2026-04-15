---
priority: medium
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 269-247-224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: subtask
---

## Description (subtask of 269-247-224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

現在の状況を整理しました。PanelBuilder.tsの `as HTMLElement` アサーションは既に全て除去済みです。残っているのは以下の型アサーションです：

- **import alias** (5件): `as coordBuild...` — リネームであり問題なし
- **`as const`** (10件): TypeScriptの正当な使用、問題なし  
- **実際の型アサーション** (6件): 修正対象

残っている6件の型アサーションを分析すると：

| 行 | コード | 安全性 |
|---|---|---|
| 511 | `"node" as NodeDisplayMode` | 型定義で解決可能 |
| 514 | `"none" as EdgeCardinalityMode` | 型定義で解決可能 |
| 606 | `panel[key] as number` | 型ガードで解決可能 |
| 609 | `panel as unknown as Record<...>` | ダブルアサーション、要リファクタ |
| 1048 | `value as "filter" \| "highlight"` | 型ガードで解決可能 |
| 1852 | `file as import("obsidian").TFile` | Obsidian APIの制約、除去困難 |
| 2089 | `Object.keys(defaults) as (keyof PanelState)[]` | TypeScript制約、除去困難 |

---

このissueは**既にほぼ完了**しており、残りのタスクは非常に小さいです。以下のように分解します：

---

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
