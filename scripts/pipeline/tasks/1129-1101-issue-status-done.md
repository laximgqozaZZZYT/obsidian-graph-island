---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1101-1080-status-done
depends: none
summary: 対象 issue ファイルの status を done に更新
---

## Description (subtask of 1101-1080-status-done)

1. ファイル特定:
     - 第一候補: `issues/1026-1014-639-626-subtask-status-done.md`
     - 無ければ Glob で `issues/pending/1026-*status-done*.md` と `issues/in-progress/1026-*status-done*.md` を探索
     - それでも無ければ exit 0 (処理済みとみなしタスク終了)

  2. Read tool で frontmatter を読み、現在の `status:` 値 (`in-progress` または `pending`) を確認

  3. Edit tool で置換 (replace_all=false):
     - old_string: 実在する方 (`status: in-progress` または `status: pending`)
     - new_string: `status: done`
     - priority / reported / source / parent / depends / summary は一切変更しない

  4. 検証:
     - `git status --short` で対象ファイル 1 件のみ `M` であること
     - `git diff <file>` で変更行が status 行のみ、`---` frontmatter 区切りが破損していないこと
     - Read tool で frontmatter 全体を再確認し他フィールドが保持されていること

  5. 受け入れ基準:
     - [ ] status フィールドが done に更新されている
     - [ ] 他のフィールドが変更されていない
     - [ ] CLAUDE.md のルール (God Object 肥大化禁止等) に違反しない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
