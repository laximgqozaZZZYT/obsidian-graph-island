---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 573-565-graphviewcontainer-ts-8597
depends: none
summary: GraphViewContainer.ts の行数を計測し 8597 以下を検証してレポート
---

## Description (subtask of 573-565-graphviewcontainer-ts-8597)

1. `wc -l src/views/GraphViewContainer.ts` を実行し現在の行数を取得
  2. CLAUDE.md GOD OBJECT Policy の Max Allowed = 8597 と比較
  3. 判定結果をレポート形式で出力:
     - 8597 以下 → PASS: 現在の行数と余裕行数を報告
     - 8597 超過 → FAIL-FAST: 超過行数を明示し、`grep -n "^\(private\|public\|protected\|async\|function\)" src/views/GraphViewContainer.ts | head -50` で上位関数/メソッドを列挙、肥大化が疑われるセクションを特定して報告
  4. コード変更は一切行わない (verify-only タスク)
  5. Acceptance criteria:
     - 行数計測が完了していること
     - 8597 との比較判定が明確に報告されていること
     - CLAUDE.md GOD OBJECT Policy に違反していないこと (ファイル変更なし = 違反不可能)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
