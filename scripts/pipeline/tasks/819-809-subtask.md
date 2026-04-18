---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 809-785-717-691-status-done
depends: none
summary: subtask
---

## Description (subtask of 809-785-717-691-status-done)

が `NO_COMMIT_MATCH` を出した場合のみ実行。コミット由来で特定できなかった
  ケースのフォールバック処理。
  1. `Grep pattern="^status: done" path="tasks/" glob="*.md" output_mode="files_with_matches"`
     で現時点で status: done になっている tasks/*.md を列挙
  2. 各候補ファイルに対し `git log --all --oneline -- tasks/<file>.md` を実行し、
     コミットメッセージやファイル名に `717`, `691`, `717-691` の文字列が含まれるものに絞る
  3. 絞り込み結果があれば `git log --all -p -- tasks/<file>.md | head -200` で
     `-status:` → `+status: done` への遷移を含むコミットを確認
  4. 最終候補を 1 件に決定し、標準出力に明示:
     ```
     TARGET_FILE: /home/ubuntu/obsidian-plugins/obsidian-graph-island/tasks/<filename>.md
     ```
     複数候補は CANDIDATE: 形式で併記 (TARGET_FILE は最も新しいコミットの 1 件)
  5. それでも該当が 0 件なら標準出力に `NO_MATCH_FOUND` を出し、理由 (調査した候補数と
     絞り込み結果) を併記して終了

  制約: ファイル変更・コミット・ブランチ切替は禁止。git log/show/status + Grep + Read のみ。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
