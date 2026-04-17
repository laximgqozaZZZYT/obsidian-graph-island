---
priority: medium
reported: 2026-04-17
status: in-progress
source: decomposed
parent: 477-473-pointerup-handler-applypaninertia-raf
depends: none
summary: subtask
---

## Description (subtask of 477-473-pointerup-handler-applypaninertia-raf)

タスクを分解します。subagent として呼ばれているため、skill 起動はスキップして直接タスク分解を提供します。

`★ Insight ─────────────────────────────────────`
- pan inertia 実装は「フィールド宣言 + pointerup 起動 + pointerdown キャンセル」が相互依存するため、同一タスクで実装する方が安全（片方だけ実装すると rAF リーク or 動作不能）
- テストは別タスクに分離し、実装の挙動を後追い検証する順序が自律パイプラインで安定
- `_panInertiaRafId` は number | null で保持し、cancelAnimationFrame 後に null に戻す規律が必要（重複起動検出のため）
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
