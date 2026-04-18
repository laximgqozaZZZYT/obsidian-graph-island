---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 804-769-
depends: none
summary: subtask
---

## Description (subtask of 804-769-)

の検証後、以下を実装:
  - subtask-1 の stdout を変数に格納
  - 改行 (\n) で split し行配列を作成 (空行は除外しない — git status --short 仕様に従う)
  - 行数 (wc -l 相当) と先頭3行 (head -3 相当) を stderr または専用デバッグログファイルに出力
  - 行リストを改行区切りのままファイル出力 or stdout に流して親タスク 760-730-git-status-short-modified の subtask-2 が読める形式で受け渡し
  - フォーマット保持: 末尾改行・空白列を改変しない (trim 禁止)
  - God Object 非変更、プラグイン側コード非変更
  テスト: 3行・0行・空白列含む stdout をモック入力として流し、行数カウントと先頭3行ログが期待通り出ることを確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
