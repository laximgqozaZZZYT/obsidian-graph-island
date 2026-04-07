---
priority: critical
reported: 2026-04-07
status: pending
summary: autonomous-improve.sh の merge-skip 競合で issue が偽完了する silent failure を防ぐ
---

## Description

2026-04-07 に issue 034 が「done」とマークされたが、実装ファイル (`scripts/pipeline/progress-report.sh`) は main に存在しなかった。

ログ調査の結果、`autonomous-improve.sh` 内の以下のシーケンスで競合が発生:

1. session A が worktree 内で実装 + コミット
2. session A が `enforce-gates.sh` を通過
3. session A が main にマージしようとする
4. **`WARN: Main dirty at merge time, skipping merge`** で実装コミットを破棄
5. しかし `issues/NNN-...md` の `status: done` 書き換えコミットだけが別経路で main に残る
6. worktree 削除で実装は消滅、issue キューだけが「完了」を主張

これは典型的な silent failure であり、`feedback_no_user_testing.md` ポリシーにも反する (「完了」が実態と乖離)。

## Acceptance criteria

- [ ] `autonomous-improve.sh` の merge スキップ時に、その session の **issue done コミットも巻き戻す** (revert or reset)
- [ ] または: issue done コミットを worktree 内で打ち、enforce-gates が通った後にまとめて1コミットとして main へ rebase する
- [ ] 受け入れ基準にファイルパスが書かれている issue は、`issue done` 直前にそのファイルが main に存在するか検証 (`git ls-files` で確認)、なければ done 拒否
- [ ] 上記検証ロジックを `scripts/pipeline/verify-issue-done.sh` として切り出し
- [ ] 既存の偽完了 issue (034 系) を一度 `pending` に戻すか `done/` に `(verified)` マーカーを付ける整理スクリプトを用意
- [ ] テスト: dirty main を意図的に作って autonomous-improve.sh を回し、merge skip 時に issue が done にならないことを確認

## Background

- 該当ログ: `/tmp/graph-island-improve.log` の `15:59:42` 付近
- 関連コミット: `084e03c9` (decompose) → `dba3637a` `5955cc3d` `f9d687c7` `be7a7984` (subtask done コミット、いずれも実装なし)
- 救出コミット: `835401bf` (私が手動で復旧)
