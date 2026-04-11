---
priority: medium
reported: 2026-04-11
status: done
source: decomposed
parent: 093-perf-animation-smoothness
depends: none
summary: subtask
---

## Description (subtask of 093-perf-animation-smoothness)

全貌が把握できました。根本原因が明確です。

`★ Insight ─────────────────────────────────────`
**根本原因の整理:**
1. **Canvas2D (`supportsAnimation = false`)** — デフォルトレンダラーがCanvas2Dで、アニメーション全般が無効化されている。レイアウト遷移（500+ノード）、ズームアニメーション、パンアニメーション全てが即座にスナップ
2. **InertiaPan 未接続** — `inertia-pan.ts` にクラスは存在するが `new InertiaPan` が一度もなく、慣性パンは完全に死んでいる
3. **ホイールズームにイージングなし** — 各wheelイベントで即座にscale適用。フレーム間補間なし
`─────────────────────────────────────────────────`

---

以下、自律パイプライン用のサブタスク分解です。

---

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
