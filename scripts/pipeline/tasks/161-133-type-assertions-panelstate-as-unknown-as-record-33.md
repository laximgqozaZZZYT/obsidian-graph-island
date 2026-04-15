---
priority: high
reported: 2026-04-15
status: pending
source: decomposed
parent: 133-type-assertions
depends: none
summary: PanelState動的キーアクセスの型安全化（`as unknown as Record` 33箇所除去）
---

## Description (subtask of 133-type-assertions)

PanelStateへの動的キーアクセス `(panel as unknown as Record<string, unknown>)[key]` パターンを型安全に置換する。
  1. `src/types.ts` に型安全ヘルパーを追加:
     - `getPanelValue<K extends keyof PanelState>(panel: PanelState, key: K): PanelState[K]`
     - `setPanelValue<K extends keyof PanelState>(panel: PanelState, key: K, value: PanelState[K]): void`
     - `type PanelKey = keyof PanelState` エイリアス（動的キー用）
  2. panel-sections*.ts と panel-widgets.ts の `as unknown as Record` / `as Record<string, boolean>` を上記ヘルパーに置換（約33箇所）
  3. hoverEdgeTypes の動的キーアクセス（`het as Record<string, boolean>`）は `Record<string, boolean>` をPanelState型定義内で正しく型付けして解消
  4. `pnpm test && pnpm lint` で破壊がないことを確認
  想定除去数: ~33

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
