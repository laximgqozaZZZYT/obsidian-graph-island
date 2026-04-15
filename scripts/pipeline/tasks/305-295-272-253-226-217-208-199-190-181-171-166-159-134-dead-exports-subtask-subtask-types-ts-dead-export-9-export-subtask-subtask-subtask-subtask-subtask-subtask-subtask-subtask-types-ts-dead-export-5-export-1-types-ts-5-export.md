---
priority: high
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 295-272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-types-ts-dead-export-5-export-1
depends: none
summary: types.ts 5型の export 削除を試行し、ビルド検証で使用中と確認して元に戻す
---

## Description (subtask of 295-272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-types-ts-dead-export-5-export-1)

5つの型エイリアスの export キーワード削除を試行する。
  
  対象:
  - ClusterGroupArrangement (L146) — PanelBuilder, panel-sections-layout, panel-defaults が import
  - ClusterGroupBy (L139) — panel-widgets が import
  - CoordinateSystem (L205) — coordinate-engine, panel-sections-layout が import
  - GridShape (L234) — coordinate-engine が import
  - GridStyle (L257) — coordinate-engine が import
  
  手順:
  1. 5つの型から export キーワードを削除
  2. pnpm build を実行
  3. 全5型で import エラーが発生するはず（grep で全て外部参照を確認済み）
  4. issue の acceptance criteria に従い、ビルドエラーが出た export は元に戻す
  5. 結果的に全5型の export を復元することになる
  6. pnpm build && pnpm test で最終確認
  7. 「5型は全て外部使用中のため dead export ではない」とコミットメッセージに記録
  
  注意: 親 issue の指示「ビルドエラーが出た場合はその export を元に戻す」に従う。
  実質的にこのタスクは false positive の確認作業となる。
```

---

全5型が `src/` 内の他ファイルから `import` されているため、export 削除はビルドエラーになります。親issueの指示通り「エラーが出たら元に戻す」を適用し、dead export ではなかったことを記録して完了するタスクです。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
