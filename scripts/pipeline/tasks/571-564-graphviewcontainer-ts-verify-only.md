---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 564-561-subtask
depends: none
summary: GraphViewContainer.ts の現状検証 (verify-only)
---

## Description (subtask of 564-561-subtask)

親タスク 561-559-graphviewcontainer-ts-verify の verify-only サブタスク。
  単一セッションで完了可能なため、分解せず実行する。

  実施内容:
  1. `src/views/GraphViewContainer.ts` の現在の行数を確認 (CLAUDE.md GOD OBJECT Policy: 8597行が上限)
  2. `pnpm test` を実行し、関連テストが通ることを確認
  3. `pnpm lint` で lint 違反がないことを確認
  4. `pnpm build` でビルドが通ること、`main.js` が 800KB バジェット内であることを確認
  5. CLAUDE.md の Forbidden Patterns に該当する箇所がないことを目視確認
     - `console.*` の有無
     - `location.reload()` の有無
     - ハードコード magic number の混入有無
  6. 検証結果を報告 (コードは変更しない)

  受け入れ基準:
  - [ ] 行数が 8597 を超えていない
  - [ ] pnpm test が PASS
  - [ ] pnpm lint がクリーン
  - [ ] pnpm build が成功し、main.js ≤ 800KB
  - [ ] Forbidden Patterns 違反なし

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
