---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 716-691-subtask-glob-read
depends: none
summary: subtask
---

## Description (subtask of 716-691-subtask-glob-read)

で取得した候補ファイルを Read ツールで1つずつ開き、
  frontmatter の `summary:` フィールドを確認する。
  `summary: subtask issueのstatusをdoneに更新しコミット` と完全一致するファイルを1つ特定する。
  特定できたら以下を stdout に出力:
    - 絶対パス (例: /home/ubuntu/obsidian-plugins/obsidian-graph-island/issues/pending/xxx.md)
    - 現在の status 値 (pending または in-progress)
  完全一致が0件または2件以上の場合は stderr に警告を出して非0終了。
  Edit / git mv / commit は行わない。特定と報告のみ。

`★ Insight ─────────────────────────────────────`
- 元issueは「特定と報告のみ」で副作用なしの read-only タスク。Glob→Read の2段で十分。
-

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
