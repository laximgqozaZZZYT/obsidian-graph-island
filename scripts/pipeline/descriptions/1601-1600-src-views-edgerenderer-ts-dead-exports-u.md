## Description (subtask of 1600-dead-exports)

scripts/list-dead-exports.mjs (ts-prune ベース) が報告する EdgeRenderer.ts の
  Category B (38件) / Category C (1件: findPerimeterBranchPoint @ line 674) を整理する。

  手順:
  1. node scripts/list-dead-exports.mjs を実行し tmp/dead-exports-report.md を生成
  2. EdgeRenderer.ts の Category B 各シンボルについて、tests/ 配下から
     `import.*<symbol>.*from.*EdgeRenderer` を grep で確認
     - tests から import されているもの: そのまま export を維持 (false positive)
     - 同一モジュール内のみ使用: `export` キーワードのみ削除 (ロジック非変更)
  3. Category C `findPerimeterBranchPoint` は src/ 配下で参照ゼロを確認後、
     ts-prune の "used in module" でもないなら関数定義ごと削除
  4. EdgeRenderer.ts は GOD OBJECT (Max Allowed 2765 行)。
     export 削除は行数増やさないので問題なし。**新規行追加は禁止**
  5. pnpm build && pnpm test で型エラー・テスト失敗が無いことを確認
  6. node scripts/list-dead-exports.mjs を再実行し、削減件数を tmp/ に残す

  期待削減: 25-39件

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
