---
priority: medium
reported: 2026-04-24
status: pending
source: decomposed
parent: 144-coverage-drop
depends: none
summary: panel-sections-layout のビルダー関数にテストを追加
---

## Description (subtask of 144-coverage-drop)

`src/views/panel-sections-layout.ts` は 52.0% カバレッジ（338 SLOC）。
  `Grep -n "^export function"` で列挙できるビルダー関数のうち、未テストのものを2〜3個選び、
  新規テストファイル `tests/panel-sections-layout.test.ts` を作成。
  内容は

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
