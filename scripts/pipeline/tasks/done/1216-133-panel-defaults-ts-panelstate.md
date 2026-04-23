---
priority: high
reported: 2026-04-24
status: done
source: decomposed
parent: 133-type-assertions
depends: none
summary: panel-defaults.ts のデフォルト配列アサーションを PanelState 型注釈で除去
---

## Description (subtask of 133-type-assertions)

`DEFAULT_PANEL_STATE` に明示的な `PanelState` 型注釈を付け、`[] as string[]`, `null as string | null`, `[] as PanelState["subgraphStack"]`, `"node" as NodeDisplayMode` など19箇所の要素側アサーションを除去する。
  必要に応じて `PanelState` のフィールド型を緩める（`string[]` の readonly 要素型を正しく定義）。
  - 対象: panel-defaults.ts の19箇所
  - 検証: `pnpm tsc --noEmit`, `pnpm test`, `pnpm lint`
  - 期待削減: 19箇所

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
