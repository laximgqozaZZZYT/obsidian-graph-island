## Description (subtask of 1491-settimeout-leaks)

subtask-2 で導入/利用したタイマー管理の cleanup 動作を vitest で検証する。
  ManagedTimers ユーティリティを使う場合: clear(id), clearAll() がペンディング中の
  タイマーを実際にクリアすることを fake timers で確認。
  Component lifecycle を使う場合: Component の onunload() 後に登録した callback が
  呼ばれないことを確認するテストを最低 1 ファイル追加。
  既存カバレッジしきい値(S28.6/B27.1/F25.4/L28.3)を下回らないこと、
  `pnpm test` 全 PASS を確認すること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
