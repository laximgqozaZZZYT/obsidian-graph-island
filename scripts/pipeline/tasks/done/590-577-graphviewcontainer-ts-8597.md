---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 577-567-subtask
depends: none
summary: GraphViewContainer.ts の行数が 8597 上限以下であることを検証
---

## Description (subtask of 577-567-subtask)

GOD OBJECT ポリシー "ratchet down only" の検証タスク。コード変更なし。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` で現在の行数を取得
  2. CLAUDE.md の GOD OBJECT Policy 表の `GraphViewContainer.ts` の "Max Allowed" 値 (8597) と比較
  3. 現在行数 <= 8597 であることを確認
  4. 違反がなければ空コミット (`git commit --allow-empty -m "chore: verify GraphViewContainer.ts within GOD OBJECT limit"`) で完了
  5. 違反があれば、超過分の抽出候補を issue コメントに記録し、別タスクへエスカレーション

  受け入れ条件:
  - `wc -l src/views/GraphViewContainer.ts` の出力が 8597 以下
  - `pnpm lint` および `pnpm test` がグリーン (変更なしなので事前状態を維持)
  - CLAUDE.md の "Max Allowed" 値は変更しない (ratchet down 以外の更新禁止)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
