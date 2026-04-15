---
priority: high
reported: 2026-04-16
status: pending
source: decomposed
parent: 295-272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-types-ts-dead-export-5-export-1
depends: none
summary: types.ts の5型エイリアスから export キーワード削除 + ビルド・テスト検証
---

## Description (subtask of 295-272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-types-ts-dead-export-5-export-1)

src/types.ts の以下5行で `export type` → `type` に変更:
  - L139: ClusterGroupBy
  - L146: ClusterGroupArrangement  
  - L205: CoordinateSystem
  - L234: GridShape
  - L257: GridStyle

  これらは types.ts 外からの import が0件（grep確認済み）。
  同ファイル内の他の型定義（CoordinateLayout, GridAxisConfig等）から
  参照されているため宣言自体は残す。

  手順:
  1. 5箇所の `export type` → `type` に変更
  2. `pnpm build` でビルド確認
  3. `pnpm test` でテスト確認
  4. ビルドエラーが出た型があれば、その型のみ export を復元
  5. コミット
```

---

1タスクのみです。5つのsed置換 + ビルド + テストで完了する作業なので、これ以上の分解は不要です。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
