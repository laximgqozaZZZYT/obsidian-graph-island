---
priority: medium
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 1034-1017-subtask
depends: none
summary: 1017-995-subtaskの原子操作（git mv + frontmatter更新 + commit）を実行
---

## Description (subtask of 1034-1017-subtask)

元issueのInsightに従い、これ以上の分解は行わず単一の原子操作として実行する。

  手順:
  1. `issues/` 配下で `*1017-995-subtask*.md` に合致するファイルをGlobで検索
     - 0件: 既に処理済みとみなし、no-opで終了（exit 0）
     - 2件以上: 状態異常としてエラー終了（人間のレビューが必要）
     - 1件: 以下の処理に進む
  2. ファイル内のfrontmatter `status:` を現在の値から `done` に更新
  3. `git mv <path> issues/done/<basename>` でdoneディレクトリへ移動
  4. `git commit` でコミット（メッセージ例: `chore: mark 1017-995-subtask as done`）

  注意:
  - CLAUDE.md の禁止パターン（God Object肥大化、coverage閾値緩和、console.* 追加等）には該当しない純粋なファイル操作
  - テストコード変更は発生しないため、`pnpm test` の実行は不要
  - frontmatter書換と`git mv`を別コミットに分けない（中間状態でpipelineが破綻する）

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
