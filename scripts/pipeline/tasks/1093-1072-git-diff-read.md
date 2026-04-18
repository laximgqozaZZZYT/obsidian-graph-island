---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1072-1056-639-626-subtask-active-1-status-done
depends: subtask-2
summary: git diff と再 Read で差分を検証（テストフェーズ）
---

## Description (subtask of 1072-1056-639-626-subtask-active-1-status-done)

以下を検証し、いずれか失敗すれば差し戻し:
  1. Bash `git status --short` で変更が当該 1 ファイルのみであることを確認。
  2. Bash `git diff -- <file>` で差分が frontmatter の status 1 行のみ (削除1行 + 追加1行) であることを確認。
  3. 再 Read で priority / reported / source / parent / depends / summary / Description 本文が一字一句保持されていることを確認。
  4. 選定ファイルの `status:` が `done` になっていることを確認。
  ソース/設定未変更のため `pnpm test` / `pnpm lint` は非実行で可。
  ファイル変更なし (検証のみ)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
