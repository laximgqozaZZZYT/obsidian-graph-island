---
priority: high
reported: 2026-04-24
status: in-progress
source: decomposed
parent: 1221-143-renderer-decorator-constants-ts
depends: none
summary: EnclosureRenderer の定数23個を constants.ts に `ENCLOSURE_` プレフィクスで集約
---

## Description (subtask of 1221-143-renderer-decorator-constants-ts)

1. `src/constants.ts` に `// ---- Renderer decorations ----` セクションを新設（既存があれば再利用）。
  2. `src/views/EnclosureRenderer.ts` から数値リテラル/定数定義（パディング、線幅、角丸半径、透明度、オフセット等、約23個）を抽出。
  3. すべて `ENCLOSURE_` プレフィクスで `constants.ts` に `export const` として追加。
  4. `EnclosureRenderer.ts` では `import { ENCLOSURE_* } from '../constants'` に置き換え、インラインリテラルを撤廃。
  5. ズーム/LOD/密度スケール系は対象外（`RenderThresholds` 範疇）。
  6. `pnpm test` と `pnpm lint` が通ることを確認。
  禁止: `EdgeRenderer.ts`, `RenderPipeline.ts` は触らない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
