---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 609-595-graphviewcontainer-ts
depends: none
summary: subtask
---

## Description (subtask of 609-595-graphviewcontainer-ts)

`★ Insight ─────────────────────────────────────`
- このissueは「テスト実行＋カバレッジ検証」という検証系タスクで、新規コード生成は発生しないため、分解粒度は小さくしても過剰になります
- GraphViewContainer関連テストは `tests/views/GraphViewContainer.*.test.ts` など複数ファイルに分散している可能性が高く、`pnpm test -- GraphViewContainer` はパスマッチで拾う点に注意
- カバレッジラチェット（S28.6/B27.1/F25.4/L28.3）は **プロジェクト全体** の閾値であり、単一ファイルのカバレッジではない点が落とし穴
`─────────────────────────────────────────────────`

以下、2タスクに分解します（テスト実行と結果記録は分離せず1タスク、カバレッジ検証は独立タスク）。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
