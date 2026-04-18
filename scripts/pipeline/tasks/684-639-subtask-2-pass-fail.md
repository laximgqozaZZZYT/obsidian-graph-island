---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 639-607-memory-md
depends: none
summary: subtask-2 の検証結果を読み取り PASS/FAIL を判定
---

## Description (subtask of 639-607-memory-md)

subtask-2 (607-597 の verify タスク) が生成した JSON レポート or
  該当 issue ファイルの frontmatter (`status:` および本文の PASS/FAIL 件数) を読み取り、
  以下を標準出力にサマリとして出す:
    - status (done / blocked)
    - PASS 件数
    - FAIL 件数
    - 実行日 (YYYY-MM-DD)
  FAIL>0 または status=blocked の場合は「SKIP: subtask-3 は実行しない」と出力して終了。
  PASS 時は次タスクが使える形で件数を保存 (例: /tmp/607-597-subtask-2-result.txt に1行サマリ)。
  ファイル編集は行わない (読み取り+集計のみ)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
