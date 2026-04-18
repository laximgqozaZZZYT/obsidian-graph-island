---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 617-593-594-585-done
depends: none
summary: 親タスク594のdone確認とGraphViewContainer.ts行数検証
---

## Description (subtask of 617-593-594-585-done)

Read-only検証ステップ:
  1. `issues/done/594-585-graphviewcontainer-ts-god-object-8597.md` を Read し、
     frontmatter の `status: done` を確認。done でない場合は本タスクを
     未完了として終了 (status 変更せず)。
  2. `wc -l src/views/GraphViewContainer.ts` で現在の行数を取得。
  3. CLAUDE.md の GOD OBJECT Policy 表の Max Allowed (8597) と比較。
     - 超過: 失敗として報告し、本タスクを done に遷移させない。
     - 同一または減少: 次のサブタスクへ進む条件を満たす。
  4. 行数が減っている場合は数値を記録 (次サブタスクで CLAUDE.md ratchet down に使用)。
  新規ファイル追加・ロジック変更・GraphViewContainer.ts 本体編集は禁止。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
