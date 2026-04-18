---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 691-662-subtask-status-done
depends: none
summary: 対象 subtask ファイルを Glob + Read で特定
---

## Description (subtask of 691-662-subtask-status-done)

1. Glob ツールで `issues/pending/*639-626*subtask*.md` にマッチするファイルを列挙する。
  2. 複数ヒットした場合、各ファイルを Read して frontmatter を確認する。
  3. `summary: subtask issueのstatusをdoneに更新しコミット` と完全一致するファイルを1つ特定する。
  4. 特定したファイルの絶対パスと現在の status 値 (pending または in-progress) を出力する。
  5. この時点では Edit / git mv / commit は行わない。特定と報告のみ。
  6. マッチが0件または複数件（同一 summary）の場合は stderr に警告を出して非0終了。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
