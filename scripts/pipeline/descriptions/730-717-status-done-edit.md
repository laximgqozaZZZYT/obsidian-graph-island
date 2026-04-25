
## Description (subtask of 717-691-status-done-edit)

1. Edit ツールで `status: decomposed` または `status: decomposed` を
     `status: done` に置換する。old_string には周囲の frontmatter 行を
     含めて一意性を確保する (例: `---\n...\nstatus: decomposed\n...`)。
  2. Edit 直後に Read で再読込し、以下を検証:
     - `status: done` になっている
     - 他の frontmatter フィールド (priority/reported/parent/depends/
       summary/source) が subtask-1 で記録した値と完全一致
     - 本文 (## Description 以降) が一切変更されていない
  3. Bash で `git status --short` を実行し、対象ファイルが `M` マーク
     (modified) になっていることを確認する。複数ファイルが modified に
     なっている場合は警告する。
  4. git mv / git add / git commit は実行しない (兄弟タスクに委譲)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
