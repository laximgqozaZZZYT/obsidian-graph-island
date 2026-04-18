---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1038-1023-issue-1015-994-subtask-pending
depends: none
summary: 1015-994-subtask.md を読み対象pendingファイルを特定し存在とstatusを記録
---

## Description (subtask of 1038-1023-issue-1015-994-subtask-pending)

以下を順に実施し、結果をコメントまたはissue本文に追記する形で記録（コミット不要、ソースコード不変更）。

  1. `.claude/issues/pending/1015-994-subtask.md` を Read で読む
  2. 本文内で言及されている「対象 issue ファイル」のファイル名を抽出
     - 例: `1015-994-subtask.md` が参照している pending issue のファイル名（`.claude/issues/pending/XXXX.md`）
  3. Glob または `ls` 相当で `.claude/issues/pending/` に該当ファイルが存在することを確認
  4. 該当ファイルの frontmatter を Read し、`status:` の現在値を記録
  5. 結果を以下の形式で出力:
     ```
     referenced_file: .claude/issues/pending/XXXX.md
     exists: true/false
     current_status: <value>
     ```

  制約:
  - `.claude/issues/pending/1015-994-subtask.md` とその参照先ファイル以外は変更しない
  - ソースコード (src/, tests/) には触れない
  - コミット不要（調査結果をログ/出力するのみ）
  - 親issue `1023-1015-pending-done-git-mv-frontmatter-status` の次のサブタスク（git mv + frontmatter更新）で使用するための下調べ

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
