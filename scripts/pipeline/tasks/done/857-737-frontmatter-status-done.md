---
priority: medium
reported: 2026-04-19
status: done
source: decomposed
parent: 737-721-issue-frontmatter-status-done
depends: none
summary: frontmatter再読込と status:done 一意性検証
---

## Description (subtask of 737-721-issue-frontmatter-status-done)

親タスク 702-691-edit-status が編集した issue ファイルを read-only で検証する。
  
  手順:
  1. Read ツールで対象 issue ファイルを offset=0, limit=30 で読み込み、先頭の `---` から `---` までの frontmatter ブロックを特定する
  2. Grep (path=同ファイル, pattern=`^status:`, output_mode=count) で status 行が frontmatter 内に **ちょうど1件** 存在することを確認
  3. Grep (path=同ファイル, pattern=`^status: done`) で `status: done` が存在することを確認
  4. Grep (path=同ファイル, pattern=`^status: done`) で `status: in-progress` が **存在しない** ことを確認 (ヒット0件)
  
  いずれかが不整合なら FAIL を報告。コード編集は一切行わない (read-only verification)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
