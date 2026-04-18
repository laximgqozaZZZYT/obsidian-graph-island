---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 593-585-subtask
depends: none
summary: subtask
---

## Description (subtask of 593-585-subtask)

`★ Insight ─────────────────────────────────────`
- このissueは「トラッカー/プレースホルダー型」で、実作業は別タスク(594-585)に集約されています。こうしたタスクを無理に分解すると偽の作業が発生するため、最小限の検証タスクに留めるのが適切です。
- CLAUDE.md の GOD OBJECT Policy より `GraphViewContainer.ts` は8597行が上限。親タスクの分解作業は「Max Allowed」を下げる(ratchet down)方向の変更のはずなので、本プレースホルダーは**ライン数が減ったこと**も検証対象になり得ます。
`─────────────────────────────────────────────────`

このissueは検証専用プレースホルダーのため、実質1タスクに収束します。無理な分解は行わず、検証アクションのみ明示します。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
