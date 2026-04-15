---
priority: medium
reported: 2026-04-15
status: in-progress
source: decomposed
parent: 148-134-116-scattered-constants-subtask-gvc-gvc-constants-ts-god-object
depends: subtask-1
summary: VIEW_TYPE_GRAPHをgvc-constants.tsに移動＋main.tsのimportパス更新
---

## Description (subtask of 148-134-116-scattered-constants-subtask-gvc-gvc-constants-ts-god-object)

1. GVC L319 の export const VIEW_TYPE_GRAPH = "graph-view" を gvc-constants.ts に移動
  2. GVC側を import { VIEW_TYPE_GRAPH } from "./gvc-constants" に変更
     （GVC内 L748 getViewType() で使用）
  3. src/main.ts の import パスを更新:
     現在 GVC から import している VIEW_TYPE_GRAPH を gvc-constants.ts からの import に変更
  4. 他に VIEW_TYPE_GRAPH を参照しているファイルがないか grep で確認し、あれば更新
  5. pnpm build && pnpm test && pnpm lint で全パス確認
  6. GVC の行数がさらに1行減ることを確認
```

---

`★ Insight ─────────────────────────────────────`
- **2タスクで十分な理由**: 定数移動は機械的な作業で、40個をまとめて移動しても1セッションで余裕。VIEW_TYPE_GRAPHだけ分離したのは、これが `export` 済みで外部ファイル（main.ts）から参照されているため、import パス変更の影響範囲が異なるから。
- **God Object削減効果**:

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
