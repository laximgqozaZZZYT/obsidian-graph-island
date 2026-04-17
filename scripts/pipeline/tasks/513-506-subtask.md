---
priority: medium
reported: 2026-04-17
status: pending
source: decomposed
parent: 506-492-pnpm-build
depends: none
summary: subtask
---

## Description (subtask of 506-492-pnpm-build)

で取得したバイト数 N を使って以下を実行:
  1. N ≤ 819200 (800KB) を検証。超過した場合はこのサブタスクを失敗扱いとし、親タスク 492-483 に戻す
     （削減作業はこのサブタスクのスコープ外、CLAUDE.md「GOD OBJECT Policy」違反の肥大化改修を避けるため）
  2. 予算内なら標準出力に `main.js: <N> bytes (<percent>% of budget, budget=819200)` 形式で記録
     （percent は小数1桁、例: `main.js: 777000 bytes (94.8% of budget, budget=819200)`）
  3. ビルド産物 main.js の差分が出ている場合のみ、`chore: verify bundle size within 800KB budget` メッセージでコミット
     （差分がなければコミットせず、ログ出力のみで完了）
  コードには一切の変更を加えず、`pnpm build` / `pnpm lint` / `pnpm test` は再実行不要（

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
