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

`★ Insight ─────────────────────────────────────`
- この issue は既にかなりアトミック（Read 1回 + 値抽出 + 分岐判定）なので、過剰分解は避け2タスクに留めるのが妥当
- frontmatter status の YAML 抽出は `/^status:\s*(pending|in-progress|done)\s*$/m` の正規表現で十分（YAMLパーサー不要）
- depends チェーンは 701-691-glob-read → 本タスク → 後続の edit 処理、という流れが前提
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
