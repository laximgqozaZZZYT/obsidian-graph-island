---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 625-609-subtask
depends: none
summary: subtask
---

## Description (subtask of 625-609-subtask)

`★ Insight ─────────────────────────────────────`
- 検証系タスク（テスト実行・カバレッジ確認）は新規コード生成がないため、2タスクまでに収めるのが適切です。5タスクに分解すると1タスクあたりの実作業が数コマンドになり過剰粒度になります
- カバレッジラチェット検証は `pnpm test:coverage` の出力を `vitest.config.ts` の閾値と比較する独立工程で、テスト実行自体と分離することで再実行コスト（カバレッジ計測は遅い）を分離できます
- GraphViewContainer のテストは `tests/views/` 配下に複数ファイルで分散している可能性が高く、`pnpm test` をパターン指定なしで実行する方が漏れがありません
`─────────────────────────────────────────────────`

以下、2タスクに分解します。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
