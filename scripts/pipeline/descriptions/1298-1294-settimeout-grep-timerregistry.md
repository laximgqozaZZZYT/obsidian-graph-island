## Description (subtask of 1294-settimeout-leaks)

まず `rg "setTimeout\(" src/` と `rg "clearTimeout\(" src/` で全使用箇所を列挙し、
  ファイル単位で setTimeout 数 - clearTimeout 数 を計算して未クリア箇所を特定する。
  各クラスに private timers = new TimerRegistry() を追加 (既存メンバ変数の近く)。
  未クリア setTimeout を this.timers.setTimeout(fn, ms) に置換。
  各クラスの onunload() / destroy() / cleanup() / detach() / onClose() で
  this.timers.clearAll() を呼ぶ。
  ※GraphViewContainer.ts などの God Object については「Max Allowed 行数を超えない」よう
  既存ロジックの近接行で置換するのみ。新メソッド追加で行数を増やす場合は同等以上の削減
  (例: 重複した clearTimeout 個別呼び出しの削除) を行う。
  受け入れ条件: `rg -c "setTimeout\(" src/` と `rg -c "clearTimeout\(" src/` の差分合計が
  10 以下になること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
