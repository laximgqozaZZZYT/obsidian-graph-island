---
priority: high
reported: 2026-04-17
status: pending
source: decomposed
parent: 511-506-pnpm-build-main-js
depends: none
summary: pnpm build 実行と exit code 検証
---

## Description (subtask of 511-506-pnpm-build-main-js)

プロジェクトルート `/home/ubuntu/obsidian-plugins/obsidian-graph-island` で `pnpm build` を実行する。
  - exit code が 0 でない場合: stderr/stdout をそのまま出力し、`BUILD_FAIL` を出力してサブタスク失敗として終了
  - exit code 0 の場合: 次サブタスクで参照するため `main.js` が存在することのみ確認
  ファイル変更・コミットは一切行わない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
