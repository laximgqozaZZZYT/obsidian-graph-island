---
priority: low
reported: 2026-04-18
status: cancelled
source: decomposed
parent: 627-609-subtask
depends: subtask-1
summary: +1.0pt超過項目があればCLAUDE.md/vitest.config.ts閾値ラチェット
---

## Description (subtask of 627-609-subtask)

subtask-1 のレポートで「引き上げ候補」が1つ以上あった場合のみ実行 (なければスキップ・タスク完了扱い)
  1. `tasks/reports/634-624-coverage-report.md` を読み引き上げ候補を抽出
  2. CLAUDE.md の閾値表記 (S28.6 / B27.1 / F25.4 / L28.3) を新しい値に更新 (現在値 - 0.1pt をマージン目安、超過分の整数部+1桁で丸め)
  3. `vitest.config.ts` の coverage thresholds (該当ファイル別設定があれば) も同期更新
  4. `pnpm test:coverage` を再実行し新閾値で PASS することを確認 (失敗時は元に戻す)
  5. GraphViewContainer.ts は触らない。GOD OBJECT ポリシー厳守

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
