---
priority: high
reported: 2026-04-16
status: done
source: decomposed
parent: 224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask
depends: none
summary: PanelBuilder.ts の querySelectorAll/querySelector 結果の as HTMLElement をジェネリック型パラメータに置換 (10箇所)
---

## Description (subtask of 224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask)

以下の箇所で as HTMLElement を除去し、ジェネリック型パラメータを使用:

  applySettingsFilter関数 (L1140-1156):
  - L1140: querySelectorAll(".setting-item") → querySelectorAll<HTMLElement>(...)
  - L1146: querySelectorAll(".graph-control-section") → 同上
  - L1150: children の querySelectorAll も同上
  - これにより L1142,1143,1151,1153,1156 の as HTMLElement が不要になる

  sortSelect change handler (L1698):
  - querySelectorAll(".gi-node-row") → querySelectorAll<HTMLElement>(...)
  - spread + as HTMLElement[] が不要になる

  filterInput handler (L1884-1895):
  - L1884: querySelectorAll(".gi-node-row") → querySelectorAll<HTMLElement>(...)
  - L1894: querySelector(".gi-node-dir-body") → querySelector<HTMLElement>(...)
  - L1895: querySelector(".gi-node-dir-header span") → querySelector<HTMLElement>(...)
  - これにより L1886,1887,1888 の as HTMLElement が不要になる

  ビルド確認: pnpm build が成功すること
  lint確認: pnpm lint が通ること
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
