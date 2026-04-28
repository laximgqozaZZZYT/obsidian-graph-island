## Description (subtask of 1491-settimeout-leaks)

src/ 配下の setTimeout 全 43 箇所と clearTimeout 全 25 箇所を grep で列挙し、
  各 setTimeout の戻り値が変数に保存されているか・ライフサイクル(onunload/destroy/cleanup)で
  clearTimeout されているかを精読して確認する。
  未クリアの setTimeout を「ファイル:行番号:用途」の形式で .autonomous-state/settimeout-audit.md に
  記録する(このファイルだけは状態管理用なので作成可)。GOD OBJECT ファイルへの追記は禁止、
  既存コード変更はこのサブタスクでは行わない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
