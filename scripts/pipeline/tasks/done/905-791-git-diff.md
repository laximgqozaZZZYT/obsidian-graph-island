---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 791-763-subtask
depends: subtask-1
summary: git diff で意図しない変更が混入していないか検証
---

## Description (subtask of 791-763-subtask)

subtask-1 で特定したファイル群に対し `git diff` / `git diff --staged` を実行し、以下を検証:
  - CLAUDE.md で禁止されているパターンが混入していないか:
    - `console.*` の追加 (production code)
    - `location.reload()` の追加
    - ハードコードされたマジックナンバー (RenderThresholds バイパス)
    - i18n `t()` を経由しないユーザー向け文字列
    - カバレッジしきい値の引き下げ (`vitest.config.ts`)
  - GOD OBJECT ファイルの行数が "Max Allowed" を超えていないか
  - 秘密情報 (API key, token, credential) の混入がないか
  - 副作用なし: stash/reset/checkout は一切行わない
  - 検証結果をチェックリスト形式で報告 (PASS / FAIL + 該当箇所)
  - Acceptance: 全項目 PASS なら後続タスクへ進む許可、FAIL なら人間へエスカレーション

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
