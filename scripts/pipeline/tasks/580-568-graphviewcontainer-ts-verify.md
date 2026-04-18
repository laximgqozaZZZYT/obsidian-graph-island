---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 568-563-subtask
depends: none
summary: GraphViewContainer.ts の行数を verify し、閾値内であれば空コミットで記録
---

## Description (subtask of 568-563-subtask)

`src/views/GraphViewContainer.ts` が CLAUDE.md の "Max Allowed" (8597行) を超えていないことを verify するのみのタスク。副作用ゼロ・記録のみ。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` で現在行数を取得
  2. 行数判定（CLAUDE.md "Ratchet down only"）:
     - 8597行以下: 想定通り。次ステップへ進む
     - 8598行以上: **commit せず fail-fast**。行数と超過量を報告して終了
  3. `pnpm lint` と `pnpm test` をスモーク実行し、既存状態に回帰がないことを確認（verifyの一環）
  4. 問題なければ空コミットで verify 結果を記録:
     ```
     git commit --allow-empty -m "chore: verify GraphViewContainer.ts within God Object threshold

     wc -l: <actual>/8597 (Max Allowed)
     lint: pass
     test: pass"
     ```
  5. `git log -1` と `git status` で記録確認

  Acceptance criteria:
  - [ ] 行数が 8597 以下であること（8598以上は fail-fast）
  - [ ] `pnpm lint` / `pnpm test` が pass
  - [ ] 空コミットが記録され `git log` で確認可能
  - [ ] CLAUDE.md の "GOD OBJECT Policy" / "Ratchet down only" に違反しない (行数を増やさない)
  - [ ] ソースコードに一切の変更を加えない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
