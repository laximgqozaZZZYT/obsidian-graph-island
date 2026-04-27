## Description (subtask of 1391-settimeout-leaks)

`grep -rn "setTimeout(" src/views/ src/main.ts` で対象ファイルの全呼び出しを列挙し、
  GraphViewContainer.ts 以外の未クリア箇所を特定する。
  各ファイルでクラス所有の Component (PluginのonunloadやItemView/Modal等) に対し、

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
