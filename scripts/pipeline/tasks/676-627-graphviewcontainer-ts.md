---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 627-609-subtask
depends: none
summary: GraphViewContainer.ts カバレッジ測定と閾値比較レポート
---

## Description (subtask of 627-609-subtask)

1. `pnpm test` が全 PASS であることを最初に確認 (失敗時は中断)
  2. `pnpm test:coverage -- GraphViewContainer` を実行
  3. coverage/ 出力から `src/views/GraphViewContainer.ts` 行の S/B/F/L (Statements/Branches/Functions/Lines) を抽出
  4. CLAUDE.md 閾値 S28.6 / B27.1 / F25.4 / L28.3 と比較し、以下フォーマットで `tasks/reports/634-624-coverage-report.md` を出力:
     - 各項目: 現在値 / 閾値 / 差分 / ✅ or ❌
     - 下回りあり: ❌ で差分明記
     - 全項目以上: ✅
     - +1.0pt 超過項目: 「引き上げ候補: <項目> 現在X.X% → 推奨Y.Y%」を末尾に列挙
  5. GraphViewContainer.ts 本体およびその他ソースは一切編集しない (測定とレポート生成のみ)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
