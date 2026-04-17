---
priority: high
reported: 2026-04-17
status: pending
source: decomposed
parent: 506-492-pnpm-build
depends: none
summary: pnpm build を実行して main.js のバイト数を取得
---

## Description (subtask of 506-492-pnpm-build)

プロジェクトルートで `pnpm build` を実行し、esbuild が exit code 0 で成功することを確認する。
  失敗した場合はエラー出力をそのまま記録してこのサブタスクを失敗として終了（修正は親タスクのスコープ）。
  成功時は `ls -l main.js` の出力からバイト数を取得し、次サブタスクに引き継ぐために標準出力に
  `BUILD_OK bytes=<N>` 形式で1行出力する。この段階ではコミットしない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
