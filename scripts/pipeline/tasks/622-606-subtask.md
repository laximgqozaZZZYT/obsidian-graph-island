---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 606-596-issue
depends: none
summary: subtask
---

## Description (subtask of 606-596-issue)

が「超過あり」を返した場合のみ実行。PASS なら何もせずスキップ。
  `issues/<next-seq>-graphviewcontainer-ts-over-limit.md` を新規作成:
  frontmatter:
  - priority: high
  - reported: 2026-04-18
  - status: in-progress
  - source: auto-detected
  - parent: 582-570-graphviewcontainer-ts-verify-only
  - summary: GraphViewContainer.ts が 8597 行を超過 (実測 <N> 行)
  body:
  - 超過行数（N - 8597）
  - 抽出対象候補: CLAUDE.md の Decomposition Priority 1 に従い snapshot / export / filter orchestration を列挙
  - 許容されない理由: CLAUDE.md の GOD OBJECT Policy「Max Allowed は現在行数、ratchet down のみ」を引用
  - 修正はこのタスク外で別 issue として対応する旨を明記
  コード修正は行わない。issue 起票のみ。作成後 `git add` で staging するところまで。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
