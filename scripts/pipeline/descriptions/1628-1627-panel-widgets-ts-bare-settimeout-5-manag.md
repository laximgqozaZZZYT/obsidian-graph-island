## Description (subtask of 1627-settimeout-leaks)

src/views/panel-widgets.ts の lines 209, 862, 1069, 1226, 1260 にある bare `setTimeout(...)` を、
  `src/utils/managed-timers.ts` または呼び出し元の `ctx.timers` 経由の managed timer に置換する。

  - 各 setTimeout 呼び出し元の関数シグネチャに既に `ctx` が渡っているか確認
  - 渡っていない箇所 (popup auto-hide, 一時的な display 制御など) は、呼び出し元から
    `ctx.timers` を受け取れるようシグネチャを拡張するか、`ctx` がない箇所では
    呼び出し元 (PanelBuilder 側) で managed setTimeout に書き直す
  - line 209 の popup hide、line 862, 1069, 1226 (rebuild), 1260 (dismiss) を順に処理
  - 既存テスト (tests/views/panel-widgets.test.ts があれば) を実行して回帰がないことを確認
  - 完了後 `grep -c "setTimeout(" src/views/panel-widgets.ts` で 0 件になっていること

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
