---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 724-714-subtask
depends: none
summary: GraphViewContainer.ts の行数を測定し CLAUDE.md の Max Allowed を ratchet down
---

## Description (subtask of 724-714-subtask)

1. `wc -l src/views/GraphViewContainer.ts` で現在行数を測定
  2. CLAUDE.md の GOD OBJECT Policy テーブルの `GraphViewContainer.ts` 行を確認（現在 8597/8597）
  3. 現在行数 < 8597 の場合のみ、Max Allowed を実測値まで引き下げ（ratchet down only）
  4. 現在行数 == 8597 の場合は変更なし、現在行数 > 8597 の場合はルール違反として調査レポート
  5. `pnpm test` で既存テストが PASS することを確認
  6. `pnpm lint` と `pnpm format:check` が PASS することを確認
  7. CLAUDE.md の「Max Allowed = current line count. Ratchet down only.」ポリシーに厳密に従う
  8. コミットメッセージ例: `chore: ratchet GraphViewContainer.ts max allowed NNNN → MMMM`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
