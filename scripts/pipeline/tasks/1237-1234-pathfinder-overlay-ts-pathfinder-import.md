---
priority: high
reported: 2026-04-24
status: decomposed
source: decomposed
parent: 1234-1231-pathfinder-overlay-ts-12-constants-ts-pa
depends: subtask-1
summary: pathfinder-overlay.ts のインラインリテラルを PATHFINDER_ 定数 import に置換
---

## Description (subtask of 1234-1231-pathfinder-overlay-ts-12-constants-ts-pa)

1. `src/views/pathfinder-overlay.ts` の冒頭に `import { PATHFINDER_LINE_WIDTH, PATHFINDER_ARROW_SIZE, ... } from '../constants';` を追加する（subtask 1 で定義した全定数）。
  2. ファイル内のインライン数値リテラルを subtask 1 で定義した定数参照に置換する。各置換が意味的に正しいことを 1 箇所ずつ Edit で確認する（同名値が偶然一致しているだけのリテラルを誤置換しないよう、文脈を Read で確認）。
  3. ズーム閾値・LOD 閾値・密度スケール係数 のリテラル（subtask 1 で除外したもの）は置換対象外。コメントで `// zoom-adaptive, intentionally inline` 等の短い注釈を残してもよいが、行数増を避けるため最小限にする。
  4. `pnpm lint` を実行し、import 漏れ・未使用 import がないことを確認する。`pnpm lint:fix` で自動修正可能なものは修正する。
  5. `pnpm test` を実行し、全テストが green であることを確認する（pathfinder-overlay 関連テストがあれば特に注視）。
  6. ファイル行数が変更前と同等または純減していることを `wc -l src/views/pathfinder-overlay.ts` で確認する（CLAUDE.md GOD OBJECT Policy 遵守 — ただし pathfinder-overlay.ts は god object 4 ファイルには含まれないので厳格制約はないが、不要な行追加は避ける）。
  7. 禁止ファイル変更厳守: `src/views/EdgeRenderer.ts`, `src/views/RenderPipeline.ts`, `src/views/node-decorations.ts` には触らない。
```

`★ Insight ─────────────────────────────────────`
- subtask 2 で「同名値の偶然一致」に注意する必要があるのが Pathfinder のような幾何描画コードの特徴: たとえば `2` という数字が「線幅」「矢印の半開き角の係数」「配列インデックス」など複数の意味で出現しうる。grep で雑に置換すると壊れる
- `pnpm test` がオーバーレイのレンダリングを直接テストするケースは稀（Canvas 描画はユニットテストしにくい）。lint と build がオーレイの最低保証となる
- 行数同等チェックを subtask 2 に入れたのは、import 文追加で逆に増える可能性があるため — 元のリテラルが多行記述なら相殺、1 行記述ならわずかに増える可能性あり。許容範囲だが意識する
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
