---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 562-560-subtask
depends: none
summary: GraphViewContainer.ts 行数確認と空コミット作成 (verify-only)
---

## Description (subtask of 562-560-subtask)

verify-only の原子タスク。コード変更なし。
  1. `wc -l src/views/GraphViewContainer.ts` で現在行数を取得
  2. CLAUDE.md の "Max Allowed: 8597" を超えていないことを確認
  3. 超過していない場合: `git commit --allow-empty -m "verify: GraphViewContainer.ts line count within ratchet"` で検証済みコミットを作成
  4. 超過している場合: タスク失敗として報告し、親issue 560-558-graphviewcontainer-ts-verify に分解再検討を promote する
  - ビルド/テスト/lint 実行不要 (no code changes)
  - 新規ファイル作成禁止
  - GOD OBJECT ポリシーに従い、本ファイルに行を追加する変更は絶対に行わない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
