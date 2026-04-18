---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 845-837-git-status
depends: subtask-1
summary: before/after 差分検証と結果記録
---

## Description (subtask of 845-837-git-status)

1. `diff /tmp/git-status-before.txt /tmp/git-status-after.txt` を実行し exit code を確認
  2. exit code 0（差分なし）なら成功、非 0 なら追加された untracked/modified ファイル名を列挙
  3. 結果を `tasks/done/838-837-git-status-diff-result.md` に以下形式で記録:
     - 実行日時 (2026-04-19)
     - diff 出力の有無（空 / 非空）
     - 追加変更ファイル一覧（あれば）
     - 判定: PASS / FAIL
  4. CLAUDE.md のルール (God Object 非肥大化、`location.reload()` 不使用等) に違反する変更が含まれていないことを確認
  Acceptance: diff 出力が空で PASS 判定、または非空なら FAIL 理由がファイルに記録される

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
