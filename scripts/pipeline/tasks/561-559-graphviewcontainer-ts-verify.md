---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 559-558-subtask
depends: none
summary: GraphViewContainer.ts 行数 verify + 空コミット記録
---

## Description (subtask of 559-558-subtask)

親タスク 558-554-graphviewcontainer-ts-verify の verify-only 操作を実行。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` で現在の行数を計測
  2. CLAUDE.md の GOD OBJECT Policy 表に記載された Max Allowed = 8597 と比較
  3. 8597 を超過している場合は **即座に中断**（fail-fast）し、超過分とどのセクションで増えたかを報告
  4. 8597 以下の場合:
     - `pnpm lint` と `pnpm test` が通ることを確認
     - `git commit --allow-empty -m "chore: verify GraphViewContainer.ts line count within 8597 limit"` で監査証跡として空コミットを記録
  5. 完了報告に現在の行数と Max Allowed を明記

  制約:
  - GraphViewContainer.ts の中身は変更しない (verify のみ)
  - 他ファイルも変更しない
  - ratchet policy (Max Allowed の引き上げ禁止) を厳守

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
