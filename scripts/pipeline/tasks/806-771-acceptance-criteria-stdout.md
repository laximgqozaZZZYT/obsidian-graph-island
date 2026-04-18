---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 771-760-
depends: subtask-1
summary: Acceptance criteria 検証と stdout 出力ロジック
---

## Description (subtask of 771-760-)

subtask-1 の `formatGitStatusShortResult` を呼び出し、最終結果を stdout に emit するエントリポイント。
  - Acceptance criteria 3 項目を assert:
    1. git mv/add/commit が実行されていないこと (input.gitOpsPerformed === false を検証、真なら throw)
    2. target_mark が "M" または "missing" に解決されていること
    3. unexpected_changes.length>0 の場合 warnings に波及メッセージが含まれること
  - 検証通過後、`console.log(JSON.stringify(result))` で stdout 出力
  - 非ゼロ exit は assert 失敗時のみ
  - git 操作コードは一切含めない (コミット担当兄弟タスクへ委譲)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
