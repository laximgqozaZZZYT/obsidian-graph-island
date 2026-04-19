---
priority: high
reported: 2026-04-19
status: pending
source: decomposed
parent: 134-dead-exports
depends: none
summary: knipまたはts-pruneで現在のdead exports 57個をリスト化しカテゴリ分類
---

## Description (subtask of 134-dead-exports)

scripts/list-dead-exports.mjs を作成し、`npx knip --reporter json` または `npx ts-prune` を
  実行して src/ 配下のdead exports 57個を出力する。結果を tmp/dead-exports-report.md に
  カテゴリ別に整理:
  - A: テストでのみ使用 (tests/ から import されている) → export維持
  - B: 同ファイル内でのみ使用 → export 除去 (local化)
  - C: 完全未使用 → 削除候補
  - D: 型定義のみ (types.ts) → API互換性考慮
  report.md には各exportの「ファイルパス:シンボル名:行番号:カテゴリ」を記録。
  `.gitignore` に `tmp/` を追加。report は次のサブタスクで参照する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
