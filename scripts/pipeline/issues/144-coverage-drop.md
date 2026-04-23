---
priority: high
reported: 2026-04-24
status: decomposed
source: auto-discovered
summary: カバレッジ低下: statements 51.0% < 53.9%|functions 48.5% < 51.5%
---

## Description
`vitest.config.ts` の thresholds (statements: 53.9, functions: 51.5) を下回っている。

## Acceptance criteria
- [ ] テスト追加で `pnpm test:coverage` が閾値をパス
- [ ] 閾値の引き下げで回避しない (CLAUDE.md "Forbidden Patterns: Relaxing coverage thresholds")
