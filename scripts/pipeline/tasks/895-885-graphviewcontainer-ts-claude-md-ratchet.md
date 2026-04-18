---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 885-874-graphviewcontainer-ts-claude-md-ratchet
depends: none
summary: GraphViewContainer.ts 行数測定→CLAUDE.md ratchet→parent issue done化を単一コミットで実施
---

## Description (subtask of 885-874-graphviewcontainer-ts-claude-md-ratchet)

単一セッション・単一コミットで完結（再分解禁止）。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` で現在行数 N を測定
  2. N > 8597 の場合: ratchet 違反として CLAUDE.md を変更せず中断し、
     `issues/in-progress/727-715-graphviewcontainer-ratchet-issue-done.md` の
     description に違反記録（実測N行、上限8597超過）を追記して終了
  3. N <= 8597 の場合: CLAUDE.md の "GOD OBJECT Policy" テーブルの
     `src/views/GraphViewContainer.ts` 行の "Lines" 列と "Max Allowed" 列の
     両方を N に更新（Edit toolでテーブル該当行のみ変更）
  4. `issues/in-progress/727-715-graphviewcontainer-ratchet-issue-done.md` の
     frontmatter `status: in-progress` → `status: done` に変更
  5. `git mv issues/in-progress/727-715-graphviewcontainer-ratchet-issue-done.md
     issues/done/727-715-graphviewcontainer-ratchet-issue-done.md` で移動
  6. 単一コミット: `chore: ratchet GraphViewContainer max-allowed to <N> lines`

  制約（厳守）:
  - src/ tests/ には一切touch禁止（測定の Read/wc のみ許可）
  - Max Allowed を現在値より増やす変更は禁止（ratchet down only）
  - 複数コミット禁止（手順4-5-6を1 commitに含める）
  - `pnpm build` `pnpm test` は不要（コード変更なし、メタデータのみ）

  Acceptance:
  - [ ] CLAUDE.md の Lines/Max Allowed が実測 N と一致
  - [ ] issue ファイルが done/ に移動済み
  - [ ] 単一コミットで完結

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
