---
priority: low
reported: 2026-04-24
status: pending
source: decomposed
parent: 116-scattered-constants
depends: subtask-4
summary: 残存定数の最終集約と constants.ts セクション整理・検証
---

## Description (subtask of 116-scattered-constants)

src/main.ts, src/types.ts, src/i18n.ts など残りのファイルの SCREAMING_CASE 定数を
  constants.ts へ移動。constants.ts 内のセクションコメント (Layout/Render/Parser/View/Misc) で
  整理し、重複定数を1つに統合。最終的に grep -rn 'const [A-Z_]\{3,\}' src/ | grep -v 'constants.ts' | wc -l
  で 100 個以下であることを確認。pnpm build, pnpm test, pnpm lint, pnpm format:check を
  すべてグリーンにしてコミット。Acceptance criteria 達成を確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
