---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 616-593-subtask
depends: none
summary: 親タスク594-585完了状態の検証とMax Allowedのratchet down確認
---

## Description (subtask of 616-593-subtask)

検証専用プレースホルダー。以下を実施:
  1. `wc -l src/views/GraphViewContainer.ts` で現在の行数を取得
  2. CLAUDE.md の GOD OBJECT Policy テーブル (`GraphViewContainer.ts` の "Max Allowed: 8597") と比較
  3. 現在行数 < 8597 の場合、CLAUDE.md の Max Allowed を現在行数に ratchet down 更新 (同じ行の数値のみ変更)
  4. 現在行数 == 8597 の場合、親タスク594-585が未完了と判断し、このissueは no-op としてクローズコメントのみ記録
  5. `pnpm test` と `pnpm lint` で回帰がないことを確認
  6. 変更がある場合のみコミット: `chore: ratchet down GraphViewContainer.ts max allowed to <N>`
  
  Acceptance:
  - [ ] 行数検証実施
  - [ ] CLAUDE.md の Max Allowed が現実と一致 (ratchet down のみ)
  - [ ] pnpm test / pnpm lint green
  - [ ] Max Allowed を緩める変更 (引き上げ) は禁止

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
