---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 733-719-issue-frontmatter-read-status
depends: none
summary: subtask
---

## Description (subtask of 733-719-issue-frontmatter-read-status)

で取得した frontmatter 文字列に対して
  正規表現 `/^status:\s*(pending|in-progress|done)\s*$/m` を適用し status 値を特定。
  - `done` の場合: 親 issue 719-702-frontmatter-status-done-edit の後続編集処理をスキップし、パイプラインに「skip: already done」ステータスを返す。
  - `pending` / `in-progress` の場合: 値をそのまま次段（frontmatter edit タスク）へ受け渡す。
  - マッチしない／複数マッチの場合: 異常として親タスクにエスカレーションし編集を行わない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
