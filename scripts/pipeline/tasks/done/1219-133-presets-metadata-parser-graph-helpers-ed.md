---
priority: medium
reported: 2026-04-24
status: done
source: decomposed
parent: 133-type-assertions
depends: none
summary: presets/metadata-parser/graph-helpers/edge-draw-config の型アサーション正規化
---

## Description (subtask of 133-type-assertions)

- `presets.ts` (7): `JSON.parse(...) as Preset` を Zod 風の runtime validator または型ガード関数 `isValidPreset()` で置換
  - `metadata-parser.ts` (5): `frontmatter as Record<string, unknown>` 等をオプショナルチェインと `typeof`/`Array.isArray` ガードに置換
  - `graph-helpers.ts` (5): ノード/エッジ narrow を型述語 `isLinkEdge(e): e is LinkEdge` で置換
  - `edge-draw-config.ts` (5), `cluster-force.ts` (7), `coordinate-engine.ts` (7): 数値/ベクトル系キャストを純粋関数のシグネチャ修正で除去
  - 検証: `pnpm test`（全ユニット）
  - 期待削減: 約28箇所

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
