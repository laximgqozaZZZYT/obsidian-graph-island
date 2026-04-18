---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 809-785-717-691-status-done
depends: 817-809-git-log-grep-717-691-tasks-md
summary: 817 が NO_COMMIT_MATCH を返した場合の Grep ベース fallback で TARGET_FILE を特定
---

## Description (subtask of 809-785-717-691-status-done)

前提: `REPO_ROOT=$(git rev-parse --show-toplevel)` を基準にする。
タスク実体は `$REPO_ROOT/scripts/pipeline/tasks/` 配下に存在する。

起動条件: 817 の標準出力に `NO_COMMIT_MATCH` が含まれる場合のみ実行。
`SKIP_FALLBACK` が出ている場合は何もせず `SKIPPED_BY_817` を出力して終了 (exit 0)。

1. `Grep pattern="^status: done" path="scripts/pipeline/tasks/" glob="*.md" output_mode="files_with_matches"`
   で現時点で status: done になっている scripts/pipeline/tasks/*.md を列挙
2. 各候補ファイルに対し `git log --all --oneline -- scripts/pipeline/tasks/<file>.md` を実行し、
   コミットメッセージやファイル名に `717`, `691`, `717-691` の文字列が含まれるものに絞る
3. 絞り込み結果があれば `git log --all -p -- scripts/pipeline/tasks/<file>.md | head -200` で
   `-status:` → `+status: done` への遷移を含むコミットを確認
4. 最終候補を 1 件に決定し、標準出力に明示:
   ```
   TARGET_FILE: $REPO_ROOT/scripts/pipeline/tasks/<filename>.md
   ```
   複数候補は `CANDIDATE: $REPO_ROOT/scripts/pipeline/tasks/<other>.md` として併記 (TARGET_FILE は最も新しいコミットの 1 件)
5. それでも該当が 0 件なら標準出力に `NO_MATCH_FOUND` を出し、理由 (調査した候補数と
   絞り込み結果) を併記して終了

制約: ファイル変更・コミット・ブランチ切替は禁止。git log/show/status + Grep + Read のみ。

## Acceptance criteria
- [ ] 標準出力に `TARGET_FILE: <repo-relative absolute path>`、`NO_MATCH_FOUND`、または `SKIPPED_BY_817` のいずれかが出力されること
- [ ] 複数候補時は `CANDIDATE:` 行が TARGET_FILE 以外について併記されていること
- [ ] 制約違反 (ファイル変更/コミット/ブランチ操作) が発生していないこと
