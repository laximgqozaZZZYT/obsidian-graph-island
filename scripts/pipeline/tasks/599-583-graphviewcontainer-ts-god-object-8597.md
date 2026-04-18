---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 583-573-subtask
depends: none
summary: GraphViewContainer.ts の行数を計測し GOD OBJECT 閾値(8597)と照合する検証レポートを作成
---

## Description (subtask of 583-573-subtask)

コード変更を伴わない計測・検証タスク。以下を実施:

  1. `wc -l src/views/GraphViewContainer.ts` を実行し現在行数を取得
  2. CLAUDE.md の GOD OBJECT Policy テーブル記載の Max Allowed (8597) と比較
  3. 以下のいずれかのアクションを実行:
     - 現在行数 <= 8597: CLAUDE.md の Max Allowed を現在行数に ratchet down 更新 (減少方向のみ)
     - 現在行数 > 8597: 違反として報告。GOD OBJECT 肥大化の原因コミットを `git log -p --follow src/views/GraphViewContainer.ts | head -200` で特定
  4. `pnpm lint` と `pnpm test` を実行し既存品質ゲートが通ることを確認
  5. 計測結果と照合結果を親 issue (573-565-graphviewcontainer-ts-8597) のサブタスク完了ログに記録

  制約:
  - GraphViewContainer.ts には新規コードを追加しない (GOD OBJECT Policy 違反禁止)
  - CLAUDE.md の閾値は減少方向にのみ更新可 (ratchet down only)
  - Forbidden Patterns: "Growing god object files beyond their Max Allowed line count" に抵触する変更は禁止

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
