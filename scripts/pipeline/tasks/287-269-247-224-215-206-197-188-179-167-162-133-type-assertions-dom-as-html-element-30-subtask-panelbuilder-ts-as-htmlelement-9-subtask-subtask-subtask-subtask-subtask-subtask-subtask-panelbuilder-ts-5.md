---
priority: medium
reported: 2026-04-16
status: pending
source: decomposed
parent: 269-247-224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: PanelBuilder.ts の残り型アサーション5件を型安全に置換
---

## Description (subtask of 269-247-224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

PanelBuilder.ts に残る型アサーションを修正する:
  
  1. L511 "node" as NodeDisplayMode → NodeDisplayMode型定義にリテラル"node"を含め、
     defaultPanelState()の戻り値型推論で不要にする
  2. L514 "none" as EdgeCardinalityMode → 同上
  3. L606 panel[key] as number → typeof val === "number" 型ガード使用
  4. L609 (panel as unknown as Record<...>)[key] → 
     型安全なリセット関数に抽出するか、Partial<PanelState>で型付け
  5. L1048 searchModeSelect.value as "filter" | "highlight" →
     isSearchMode()型ガード関数を作成して検証
  
  注意:
  - L1852 (file as TFile) と L2089 (Object.keys as keyof[]) は
    TypeScript/Obsidian APIの制約上、除去不可。そのまま残す
  - PanelBuilder.tsの行数を増やさないこと（God Object制約: max 2218行）
  - pnpm test && pnpm lint で確認
```

---

`★ Insight ─────────────────────────────────────`
- このissueは親issueから何層にもわたって自動分解された結果、文脈が消失しています。「subtask」としか書かれておらず、本来の目的（PanelBuilder.tsの`as HTMLElement`除去）は既に完了済みでした
- 残る6件の `as` のうち、`as const` やimport aliasを除くと実質5件。うち2件はTypeScript/Obsidian APIの制約で除去不可能（`Object.keys`の戻り値型は`string[]`固定、`getAbstractFileByPath`の戻り値は`TAbstractFile | null`）
- 1セッションで完了できるサイズなので、これ以上の分解は不要です
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
