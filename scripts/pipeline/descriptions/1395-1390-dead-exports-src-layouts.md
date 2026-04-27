## Description (subtask of 1390-dead-exports)

`src/layouts/` 配下の `.ts` ファイルを精読し、
  プロジェクト内のどこからも import されていない export 名を特定する。
  検出手順:
  1. `pnpm exec knip` または `pnpm dlx ts-prune` を実行し、
     `src/layouts/` 配下の dead exports をリストアップする
  2. 各 dead export について `grep -rn "exportName" src/ tests/ e2e/` で再確認する
  3. `tests/layouts/` でテストされている純粋関数 export は保持する
     (将来テスト追加・サイクル100/101/102 で export 化された timeline 関数群など)
  4. 完全に未参照の export 宣言を削除する
  注意:
  - レイアウトアルゴリズムは「pure functions where possible」が CLAUDE.md 規約。
    既に export 化された関数は (テストが無くても) 純粋関数化された証跡として残す。
    その判断ができない場合は削除せず保持を優先する。
  完了後 `pnpm build && pnpm test && pnpm lint` が通ることを確認する。
  サブタスク1完了後の dead exports 残存数を本タスク開始時にも測定し、
  削減目標 (累積 50 個以下) への進捗を記録する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
