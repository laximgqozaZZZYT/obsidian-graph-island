---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1079-1063-subtask
depends: none
summary: 親issueファイルのfrontmatter statusをdoneに更新
---

## Description (subtask of 1079-1063-subtask)

親issue `1026-1014-639-626-subtask-status-done` に該当するファイル (通常 `.claude/issues/pending/` または `issues/pending/` 配下、ファイル名が `1026-1014-639-626-subtask-status-done.md` を含むもの) を Glob で特定し、frontmatter の `status: decomposed` または `status: decomposed` を `status: done` に書き換える。

  手順:
  1. `Glob` で `**/1026-1014-639-626-subtask-status-done*.md` を探索し対象ファイルを確定
  2. `Read` で frontmatter 冒頭を確認 (現在の status 値を把握)
  3. `Edit` で `old_string: "status: decomposed"` (または `status: decomposed`) を `new_string: "status: done"` に置換 (replace_all=false, frontmatter 内でユニークな文字列を確保するため周辺行を含める)
  4. pending → done へのディレクトリ移動が規約に含まれるなら `git mv` で移動し、コミット
  5. CLAUDE.md のルール (God Object 肥大化禁止、ハードコード禁止等) に抵触する変更は本タスクでは発生しない

  受け入れ基準:
  - 対象ファイルの frontmatter `status:` が `done` になっている
  - 他のフィールド・本文は変更されていない
  - テスト/ビルドは触らないため `pnpm test` のような実行は不要

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
