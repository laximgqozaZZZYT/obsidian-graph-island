---
priority: high
reported: 2026-04-19
status: done
source: decomposed
parent: 849-734-subtask
depends: none
summary: `console.*` がプロダクションコードに残っていないか検証
---

## Description (subtask of 849-734-subtask)

`src/` 配下で `console.log|warn|error|debug|info` を Grep で検索。
  テストファイル (`tests/`, `*.test.ts`, `*.spec.ts`) および型定義 (`*.d.ts`) を除外。
  検出時は `file:line` 形式でリスト化し issue 形式で報告。
  0件なら `PASS: console.* 未検出` をログ出力。
  esbuild.config.mjs の drop 設定も Read で確認し、プロダクションビルドで drop されることを記録。
  コード変更なし。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
