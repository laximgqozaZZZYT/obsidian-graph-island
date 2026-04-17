---
priority: medium
reported: 2026-04-17
status: pending
source: decomposed
parent: 486-477-pan-inertia-raf
depends: none
summary: subtask
---

## Description (subtask of 486-477-pan-inertia-raf)

`★ Insight ─────────────────────────────────────`
- rAF + fake timers の組み合わせは共通セットアップ (vi.stubGlobal) が重く、1ファイル内で完結させた方が保守性が高い
- 6ケースを2タスクに分割する際、setup/teardown の重複を避けるため「基本挙動」と「境界・副作用」で切るのが筋
- GraphViewContainer.ts は God Object のため本タスクは一切触らず、テストファイルのみ新規追加
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
