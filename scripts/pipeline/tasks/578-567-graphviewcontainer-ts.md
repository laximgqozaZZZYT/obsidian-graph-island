---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 567-562-graphviewcontainer-ts-verify-only
depends: none
summary: GraphViewContainer.ts 行数確認 + 空コミット作成
---

## Description (subtask of 567-562-graphviewcontainer-ts-verify-only)

verify-only の原子タスク。コード変更一切なし。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` を実行し現在行数を取得
  2. CLAUDE.md の GOD OBJECT Policy テーブル "Max Allowed: 8597" と比較
  3a. 8597行以下の場合:
      `git commit --allow-empty -m "verify: GraphViewContainer.ts line count within ratchet (<actual>/8597)"`
      (<actual> は実測行数に置換)
  3b. 8597行超過の場合:
      - 空コミット作成せず
      - タスク失敗として報告
      - 親issue `560-558-graphviewcontainer-ts-verify` に分解再検討を promote
      - 超過原因となったコミット(git log で特定)を報告に含める

  禁止事項:
  - src/views/GraphViewContainer.ts への行追加・編集
  - 新規ファイル作成
  - ビルド/テスト/lint 実行 (コード変更なしのため不要)
  - CLAUDE.md の Max Allowed 値の変更

  Acceptance:
  - [ ] `git log -1` で検証コミットが記録されていること(成功時)
  - [ ] GraphViewContainer.ts の行数が変化していないこと
  - [ ] CLAUDE.md の "Max Allowed: 8597" が不変であること

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
