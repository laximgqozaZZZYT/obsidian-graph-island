---
priority: high
reported: 2026-04-18
status: done
source: decomposed
parent: 771-760-
depends: subtask-2
summary: formatter と emit のユニットテスト
---

## Description (subtask of 771-760-)

vitest で以下ケースを網羅:
  - formatGitStatusShortResult:
    - target_mark="M" + unexpected_changes=[] → status="ok"
    - target_mark="missing" → status="warning"
    - unexpected_changes に値あり → status="warning" + warnings に波及メッセージ
    - warnings=undefined → [] にフォールバック
  - emit 層:
    - gitOpsPerformed=true → assert が throw
    - target_mark が想定外値 → assert が throw
    - 正常系で stdout に有効 JSON が出力されること (vi.spyOn(console,"log"))
  - `pnpm test` で全 PASS を確認

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
