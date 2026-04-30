## Description (subtask of 1470-type-assertions)

GraphViewContainer.ts に存在する 81件の `as T` キャストを精読し、
  50件以上を型ガード関数または正しい型注釈に置換する。
  - グローバル変数アクセス系 (`(globalThis as any).xxx`) は `src/views/gvc-types.ts` に
    `interface GraphIslandGlobals { ... }` を新設し型付きアクセサに置換
  - DOM要素キャスト (`el as HTMLInputElement` 等) は `instanceof HTMLInputElement`
    によるランタイム型ガードに置換
  - イベントターゲットキャストは `e.target instanceof HTMLElement` で絞り込み
  - 構造データキャスト (`raw as NodeData`) は src/types.ts に既存の型ガード関数
    (isNodeData, isEdgeData) を作成しそれを利用
  GOD OBJECT ポリシー遵守: GraphViewContainer.ts の行数は 8655 を超えてはならない。
  新規ヘルパーや型定義は必ず外部ファイル (gvc-types.ts または types.ts) に追加すること。
  完了条件: `grep -c " as [A-Z]" src/views/GraphViewContainer.ts` が 30 以下、
  `pnpm test` および `pnpm lint` が PASS。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
