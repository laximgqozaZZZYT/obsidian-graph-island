---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1063-1026-subtask
depends: none
summary: issueファイルの status フロントマターを done に更新
---

## Description (subtask of 1063-1026-subtask)

対象ファイルのフロントマター `status:` フィールドを適切な値 (pending/in-progress → done) に更新する。

  手順:
  1. `issues/` 配下から親issue名 `1026-1014-639-626-subtask-status-done` に該当するファイルを Glob で特定
  2. Read tool でフロントマターの現在の status を確認
  3. Edit tool で `status: <current>` → `status: done` に置換 (replace_all=false、フロントマター1箇所のみ)
  4. `git status --short` で対象ファイル1件のみ変更されていることを確認
  5. `git diff` で status 行のみ変更、他フィールド (priority/reported/source/parent/depends/summary) が保持されていることを確認

  受け入れ基準:
  - [ ] 対象ファイルの status が done に変わっている
  - [ ] 他のフロントマターフィールドは変更されていない
  - [ ] 他のファイルに変更が波及していない
  - [ ] CLAUDE.md のルール (coverage/bundle size/God Object) に違反しない (メタデータ変更のため影響なし)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
