---
priority: medium
reported: 2026-04-19
status: done
source: decomposed
parent: 1017-995-subtask
depends: none
summary: pending→done へのissue移動を1タスクで実行
---

## Description (subtask of 1017-995-subtask)

親issue `995-973-639-626-subtask-issue-1-pending-done-git` のInsightに「既に最小粒度のため分解せず1タスクで実行」と明記されているため、分解せず単一タスクとして実行する。

  手順:
  1. `.claude/issues/pending/` 配下から対象issueファイルをGlobで特定
     - 0件 → skip（冪等性を保証）
     - 2件以上 → 中断（自動推測禁止、暴走防止）
     - 1件 → 次へ
  2. `git mv <pending>/<file>.md <done>/<file>.md` で移動
  3. 移動先ファイルの frontmatter `status:` を `done` に書換
  4. `git add` + `git commit -m "chore: mark <issue-id> as done"`

  受け入れ基準:
  - [ ] pending配下から該当issueが消えている
  - [ ] done配下に該当issueが存在し `status: done` である
  - [ ] 1コミットに `git mv` と frontmatter 書換が含まれる
  - [ ] CLAUDE.md のルールに違反しない（God Object非肥大化・console非使用等）

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
