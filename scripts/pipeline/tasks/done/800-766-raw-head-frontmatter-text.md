---
priority: high
reported: 2026-04-18
status: done
source: decomposed
parent: 766-733-issue-read-frontmatter
depends: subtask-1
summary: RAW_HEAD から `---`〜`---` を抽出し FRONTMATTER_TEXT へ格納
---

## Description (subtask of 766-733-issue-read-frontmatter)

RAW_HEAD の 1行目が `---` であることを確認し、
  次の `---` が現れるまでの行を連結して FRONTMATTER_TEXT に格納するロジックを
  タスクファイル内に擬似コードで記述。
  正規表現 `/^---\n([\s\S]*?)\n---/m` でのキャプチャ方針を明記。
  ログに `[frontmatter-read] extracted <N> lines` を出力。
  次タスク (status 抽出) へ FRONTMATTER_TEXT を引き渡す旨を明示。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
