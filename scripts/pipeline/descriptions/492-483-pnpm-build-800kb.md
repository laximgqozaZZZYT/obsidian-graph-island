
## Description (subtask of 483-475-god-object)

`pnpm build` を実行し、esbuild ビルドが成功することを確認。
  生成された `main.js` のサイズを `ls -l main.js` で測定し、
  800KB (819200 bytes) 以下であることを確認。超過した場合は
  subtask-2 で追加されたコードのうち削減可能な箇所を特定する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
