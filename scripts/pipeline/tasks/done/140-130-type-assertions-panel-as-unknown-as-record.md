---
priority: high
reported: 2026-04-15
status: done
source: decomposed
parent: 130-type-assertions
depends: none
summary: panel動的キーアクセスの型安全化 — as unknown as Record パターン除去
---

## Description (subtask of 130-type-assertions)

panel-sections*.ts, PanelBuilder.ts, GVC内の
  `(panel as unknown as Record<string, unknown>)[key]` パターン(~40箇所)を型安全に。
  
  方針:
  1. src/types.ts に PanelState用のヘルパー型を追加:
     - `setPanelValue<K extends keyof PanelState>(panel: PanelState, key: K, value: PanelState[K])`
     - または `PanelDynamic` 型で動的アクセスを型安全にするユーティリティ関数
  2. EDGE_TYPE_KEYS ループ内の動的アクセスには
     keyof Pick<PanelState, EdgeTypeKey> 型ガードを使う
  3. GVC の preset保存/復元の JSON.parse 結果には
     Partial<PanelState> 型を使い、各keyをnarrowingする
  
  削減見込み: ~40個
  テスト: pnpm test && pnpm lint
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
