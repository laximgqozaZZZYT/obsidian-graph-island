---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 733-719-issue-frontmatter-read-status
depends: none
summary: subtask
---

## Description (subtask of 733-719-issue-frontmatter-read-status)

親タスク 733 は `Read 1 回 + 値抽出 + 分岐判定` というアトミックな作業のため、
実処理は兄弟 `766-733-issue-read-frontmatter` (Read) と `767-733-subtask` (regex 抽出 + 分岐) の 2 タスクで充足する。
本タスクは過剰分解の記録用プレースホルダとして残し、追加の作業は行わない。

参考実装メモ:
- YAML 抽出は `/^status:\s*(pending|in-progress|done)\s*$/m` の単一正規表現で足り、YAML パーサーは不要。
- depends チェーンは `701-691-glob-read → 766/767 → 後続 edit 処理` の順。

## Acceptance criteria
- [ ] 兄弟タスク 766-733-issue-read-frontmatter.md と 767-733-subtask.md が存在し、実処理を担うこと
- [ ] 本ファイル自体の frontmatter が parser で読取可能 (status/parent/depends が正しく記述されている)
- [ ] ソースコード・テスト・設定ファイルへの変更が 0 件 (メタタスクであり実装を伴わない)
