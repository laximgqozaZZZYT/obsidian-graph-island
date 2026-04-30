## Description (subtask of 1454-settimeout-leaks)

残りの未クリア setTimeout を 2 ファイルで対処する。各ファイルで setTimeout の戻り値を保持する Set/フィールドを
  既存があれば再利用、無ければ最小追加で導入する。コンポーネント破棄(destroy/onClose/cleanup)時に clearTimeout を呼ぶ。
  GOD OBJECT 上限(PanelBuilder 2216行、EdgeRenderer 2765行)を超えないこと。subtask-1 完了後に
  `grep -c 'setTimeout(' src/**/*.ts` と `grep -c 'clearTimeout(' src/**/*.ts` を再計測し、差分が 10 以下になるまで修正する。
  ここで対処しきれない残件があれば、当該ファイル名を

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
