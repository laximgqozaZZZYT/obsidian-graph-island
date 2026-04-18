---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 744-690-git-mv-pending-done
depends: none
summary: 対象basenameを特定しgit mvの前提条件を確認
---

## Description (subtask of 744-690-git-mv-pending-done)

1. 親issue `issues/pending/690-687-639-626-subtask-issue-status-done-git-mv.md` を読み、対象となる`<basename>.md`(GVC test report追記済みファイル)を特定
  2. `ls issues/pending/<basename>.md` で存在確認
  3. `ls issues/done/<basename>.md` で未移動であること確認(既にあれば中止)
  4. `git status` を実行し、対象ファイル以外にsrc/**やテスト・設定ファイルの変更がないことを確認
  5. もしsrc/**や他ファイルに未コミット変更があれば、このsubtaskを中止しエラー報告
  6. 確認結果をログ出力(basename, pending側存在, done側不在, 他変更なし)
  7. ファイル編集・コミットは行わない(次subtaskで実施)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
