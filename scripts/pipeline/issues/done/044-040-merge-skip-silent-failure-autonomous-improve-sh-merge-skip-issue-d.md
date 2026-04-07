---
priority: critical
reported: 2026-04-07
status: done
source: decomposed
parent: 040-merge-skip-silent-failure
depends: subtask-1
summary: autonomous-improve.sh の merge-skip 時に issue done コミットを巻き戻す
---

## Description (subtask of 040-merge-skip-silent-failure)

`autonomous-improve.sh` の merge フェーズを修正:
  1. merge 直前に現在の main HEAD SHA を `PRE_SESSION_MAIN` に記録
  2. `WARN: Main dirty at merge time, skipping merge` ブランチで、
     `git log --oneline $PRE_SESSION_MAIN..HEAD -- issues/` に該当コミットがあれば
     `git revert --no-edit` または `git reset --hard $PRE_SESSION_MAIN` で巻き戻す
  3. 巻き戻し実行を `/tmp/graph-island-improve.log` に `REVERT: rolled back issue-done commits due to merge skip` 形式でログ
  4. merge 成功パスでは `verify-issue-done.sh` を issue done コミット確定前に呼び、失敗なら done マークを拒否 (issue を pending に戻す)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
