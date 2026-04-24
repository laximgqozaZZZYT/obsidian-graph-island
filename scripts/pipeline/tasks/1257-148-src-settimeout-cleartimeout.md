---
priority: high
reported: 2026-04-25
status: in-progress
source: decomposed
parent: 148-settimeout-leaks
depends: none
summary: src/ 配下の setTimeout/clearTimeout 呼び出しを洗い出して未クリア箇所をリスト化
---

## Description (subtask of 148-settimeout-leaks)

`grep -n "setTimeout\|clearTimeout"` を src/ 全体に対して実行し、
  それぞれの呼び出し位置と周辺コンテキストを収集する。
  各 setTimeout について以下を判定する:
    - 戻り値 (timer id) を変数/プロパティに保存しているか
    - 対応する clearTimeout が destroy/onunload/cleanup ハンドラ内で呼ばれているか
    - 自己完結型 (コールバック内で一回限りの処理が完了する短命タイマー) か
  結果を `docs/investigation/settimeout-audit-2026-04-25.md` に
  「ファイル:行番号 / 用途 / クリア有無 / 推奨アクション(保存+クリア or 放置可)」の表として記録する。
  このタスクはコード変更を行わず、後続タスクの修正対象を確定することが目的。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
