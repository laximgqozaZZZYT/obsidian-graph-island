---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 617-593-594-585-done
depends: none
summary: 親594-585のdone状態とGraphViewContainer.ts行数を検証し、lint/testを実行
---

## Description (subtask of 617-593-594-585-done)

read-only検証フェーズ。以下を順次実行し、すべて緑の場合のみ次subtaskへ進める。
  1. `scripts/pipeline/tasks/done/594-585-graphviewcontainer-ts-god-object-8597.md`
     を Read。`tasks/done/` 配下に存在することが「done」の指標。
     存在しない場合 (現状: `scripts/pipeline/tasks/594-585-...md` に `status: decomposed` で滞留中)
     は本親issueをdoneに遷移させず「未完了」として終了 (エラー扱いではない)。
  2. `wc -l src/views/GraphViewContainer.ts` で現在行数を取得。
     CLAUDE.md の GOD OBJECT Policy 表の Max Allowed: 8597 と比較。
     - 8597超過 → 失敗として報告し本タスク中断(肥大化禁止)
     - 8597以下 → 現行値を記録(次subtaskでratchet down判定に使用)
  3. `pnpm lint` と `pnpm test` を実行。どちらか失敗ならその旨を報告して中断。
  4. 上記結果(現在行数/lint結果/test結果)をコミットメッセージ用に残す。
  新規ファイル追加・ロジック変更・ファイル移動は一切禁止。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
