---
priority: high
reported: 2026-04-17
status: decomposed
source: decomposed
parent: 492-483-pnpm-build-800kb
depends: none
summary: pnpm build 実行とバンドルサイズ計測
---

## Description (subtask of 492-483-pnpm-build-800kb)

`pnpm build` を実行し esbuild ビルドが成功することを確認。
  `ls -l main.js` でバイト数を取得し、819200 bytes (800KB) 以下であることを検証。
  計測結果を標準出力に記録（例: `main.js: 777000 bytes (94.8% of budget)`）。
  予算内ならこのサブタスクで完了・コミット。超過時は

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
