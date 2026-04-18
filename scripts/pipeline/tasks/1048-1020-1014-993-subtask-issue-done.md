---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1020-1013-subtask
depends: none
summary: 1014-993-subtask issue のステータスを done に遷移
---

## Description (subtask of 1020-1013-subtask)

`issues/1014-993-subtask.md` のフロントマター `status: in-progress` を `status: done` に書き換える。
  - `git mv` は使用しない (親タスク系列との競合回避)
  - 編集範囲は `issues/1014-993-subtask.md` の1ファイルのみ
  - Acceptance criteria のチェックボックス `[ ]` を `[x]` に更新
  - CLAUDE.md の God Object 制約・コード品質ゲートには影響しない (issues/ 配下のドキュメント変更のみ)
  - コミットメッセージ例: `chore: done 1014-993-subtask.md`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
