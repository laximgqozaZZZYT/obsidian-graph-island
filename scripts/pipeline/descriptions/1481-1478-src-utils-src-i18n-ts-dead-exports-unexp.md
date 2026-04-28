## Description (subtask of 1478-dead-exports)

src/utils/ 配下と src/i18n.ts の export 名を `grep -rn "^export "` で列挙し、
  各名前について src/ 全体で `import.*<name>` および `from.*<file>` の参照を確認する。
  参照ゼロのものは:
    - 純粋な内部ヘルパーなら `export` キーワードを除去 (関数/定数/型)
    - 完全に未使用の関数/定数なら関数本体ごと削除
    - tests/ からのみ参照されている場合は判断保留(別タスク)
  変更後 `pnpm test` と `pnpm lint` が通ることを確認。
  対象目安: 30〜40 件程度の dead exports を unexport/削除する。
  god object には触れない (このタスクは src/utils と src/i18n.ts のみ)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
