---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 950-941-subtask
depends: none
summary: 親issueのfrontmatter statusをdoneに更新しAcceptanceチェックを埋める
---

## Description (subtask of 950-941-subtask)

対象ファイル: `.claude/issues/941-934-760-730-status-done-acceptance.md` (存在しない場合は親issueのファイル名に合わせて特定)

  変更内容:
  1. frontmatter の `status:` を `done` に変更 (既に `done` なら no-op で終了)
  2. `## Acceptance criteria` セクション直下の `- [ ]` 行のみを `- [x]` に変更
     - Edit ツールは `replace_all` を使わず、Acceptance セクション内の各行を個別の old_string で指定
     - Description 本文に `- [ ]` が混入していても影響を与えないこと
  3. ビルド/テスト実行は不要 (マークダウン編集のみ)
  4. コミットメッセージ: `chore: done 941-934-760-730-status-done-acceptance`

  完了条件:
  - `grep "^status:" <file>` が `status: done` を返す
  - Acceptance セクションの全チェックボックスが `- [x]`
  - `git diff` が当該ファイル1件のみの差分

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
