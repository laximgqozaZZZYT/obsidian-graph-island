---
priority: high
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 257-241-223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask-diffoverlay-ts-as-htmlelement-3-instance-subtask
depends: none
summary: DiffOverlay.ts instanceof置換の検証（テスト・リント通過確認）
---

## Description (subtask of 257-241-223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask-diffoverlay-ts-as-htmlelement-3-instance-subtask)

DiffOverlay.ts の `as HTMLElement` → `instanceof HTMLElement` ガード置換（L370, L373）が既に完了済み。
  以下を実行して通過を確認する：
  1. `pnpm test` — 全ユニットテストが通ること
  2. `pnpm lint` — ESLintエラーがないこと
  3. DiffOverlay.ts 内に `as HTMLElement` が残っていないことを grep で確認
  4. 問題なければissueをクローズ

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
