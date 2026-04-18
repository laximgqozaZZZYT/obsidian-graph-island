---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 627-609-graphviewcontainer
depends: none
summary: subtask
---

## Description (subtask of 627-609-graphviewcontainer)

`★ Insight ─────────────────────────────────────`
- このissueは「検証タスク」であり、実装を伴わないため分解粒度が小さくなる
- カバレッジ閾値は `vitest.config.ts` と `CLAUDE.md` の2ヶ所に散在。整合性チェックを先に入れることで、閾値の"silent drift"を検出できる
- ラチェット設計では閾値引き下げが禁止パターン → FAILしたら実装改善側で対応すべきで、閾値を下げる選択肢は分解から除外
`─────────────────────────────────────────────────`

以下に分解します。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
