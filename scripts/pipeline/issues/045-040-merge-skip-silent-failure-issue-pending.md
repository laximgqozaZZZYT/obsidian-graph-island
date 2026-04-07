---
priority: high
reported: 2026-04-07
status: in-progress
source: decomposed
parent: 040-merge-skip-silent-failure
depends: subtask-1
summary: 既存の偽完了 issue を pending に戻す整理スクリプト
---

## Description (subtask of 040-merge-skip-silent-failure)

新規スクリプト `scripts/pipeline/reconcile-false-done.sh` を作成:
  1. `issues/done/` 配下の全 .md を走査
  2. 各 issue に対し `verify-issue-done.sh` を呼ぶ
  3. 失敗したものを `issues/done/` → `issues/` へ git mv し、frontmatter の `status: done` を `status: in-progress` に sed 置換
  4. ログに `RECONCILE: <issue> moved back to pending (missing: <files>)` 出力
  5. dry-run モード (`--dry-run`) をサポート
  手動実行前提 (cron には入れない)。初回実行で issue 034 系が復元されることを確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
