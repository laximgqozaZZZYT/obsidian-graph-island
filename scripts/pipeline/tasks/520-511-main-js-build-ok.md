---
priority: high
reported: 2026-04-17
status: decomposed
source: decomposed
parent: 511-506-pnpm-build-main-js
depends: subtask-1
summary: main.js のバイト数を BUILD_OK 形式で出力
---

## Description (subtask of 511-506-pnpm-build-main-js)

`ls -l main.js` の出力からバイト数（5列目の整数値）を取得し、標準出力に
  `BUILD_OK bytes=<N>` 形式で1行だけ出力する。
  - N は10進整数（カンマなし）
  - main.js が存在しない場合は `BUILD_FAIL no-main-js` を出力して失敗
  - 800KB 予算(`CLAUDE.md` 記載)との比較はこのサブタスクのスコープ外（親タスクで処理）
  ファイル変更・コミットは一切行わない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
