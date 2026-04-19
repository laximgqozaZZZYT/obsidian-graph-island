---
priority: high
reported: 2026-04-19
status: done
source: decomposed
parent: 135-e2e-smoke-fail
depends: subtask-2
summary: unit test追加 + E2E smoke再実行で受入基準確認
---

## Description (subtask of 135-e2e-smoke-fail)

- tests/utils/graph-filter.test.ts に subtask-2 で修正した挙動をカバーする
    unit test を追加(既存 filterOrphans テストの延長、境界値3-5件)
  - `pnpm test` で unit test 全PASS確認
  - `pnpm lint` + `pnpm format:check` PASS確認
  - `pnpm build` でバンドル生成(800KB budget内)
  - `pnpm test:e2e -- e2e/smoke.spec.ts` で18 passed 達成確認
    (ローカルでObsidian CDP :9222 必要)
  - カバレッジ閾値(S/B/F/L)が下がっていないことを確認

`★ Insight ─────────────────────────────────────`
- 3タスク構成にした理由: 調査→修正→検証のクラシックなバグ修正フロー。この issueは「新機能」ではなく「テスト失敗の修正」なのでパーサー/型/UIタスクは不要
- subtask-2 が条件分岐(A/B)を含むのは、E2E失敗が**プロダクションバグ**か**テスト側の古い期待値**かは調査しないと断定できないため — 調査結果に応じてどちらを直すか決めるのが正しい
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
