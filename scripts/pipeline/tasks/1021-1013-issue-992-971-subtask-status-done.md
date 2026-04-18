---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1013-992-subtask
depends: none
summary: 親 issue 992-971-subtask のフロントマター status を done に更新
---

## Description (subtask of 1013-992-subtask)

`issues/992-971-subtask.md` のフロントマター `status: decomposed` を `status: done` に書き換える単一編集タスク。
  制約:
  - `git mv` 禁止 (ファイル名変更は並行タスク 988-928-...-git-m 系列が担当)
  - 編集範囲は `issues/` 配下のみ
  - `src/` および god object ファイル (GraphViewContainer.ts 等) には触れない
  - 本文・他フィールドは変更せず、status 行のみ更新
  検証:
  - `git diff` で frontmatter 1行の変更のみであることを確認
  - CLAUDE.md の Forbidden Patterns に抵触しないこと (coverage/god object/magic number いずれも無関係)
  - テストやビルドへの影響がないため `pnpm test` 等は不要 (issues/ は build 対象外)
  コミット:
  - `chore: mark 992-971-subtask as done`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
