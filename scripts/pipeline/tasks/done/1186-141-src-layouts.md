---
priority: high
reported: 2026-04-24
status: done
source: decomposed
parent: 141-coverage-drop
depends: none
summary: src/layouts/ の未カバー純粋関数にテスト追加
---

## Description (subtask of 141-coverage-drop)

カバレッジレポートから src/layouts/ 配下で未カバーの export 済み純粋関数を
  3〜5 個特定する。対応する tests/layouts/ にテストを新規または追記し、
  合計 10〜20 件のユニットテストを追加する。
  対象候補: sunburst.ts, timeline-layout.ts, cluster-force.ts の
  未テスト helper (計算系 / 配置系)。
  再帰関数・ソート関数・座標変換関数を優先。ロジック変更は禁止 (テスト追加のみ)。
  `pnpm test` で全件 PASS 確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
