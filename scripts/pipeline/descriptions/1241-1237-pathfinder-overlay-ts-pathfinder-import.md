
## Description (subtask of 1237-1234-pathfinder-overlay-ts-pathfinder-import)

1. `src/constants.ts` を Read して subtask 1 で定義された PATHFINDER_ 定数の一覧と値を確認する。
  2. `src/views/pathfinder-overlay.ts` を Read で全文確認し、PATHFINDER_ 定数の値と一致するインラインリテラル出現箇所を列挙する。
  3. ファイル冒頭に `import { PATHFINDER_LINE_WIDTH, PATHFINDER_ARROW_SIZE, ... } from '../constants';` を追加する（subtask 1 で定義した定数のみ import、未使用は含めない）。
  4. 列挙した各リテラルを 1 箇所ずつ Edit で定数参照に置換する。置換前に該当行と前後数行を Read で再確認し、「同名の数値が別の意味で使われていないか」を文脈判断する（例: 配列 index の `2`、tau 分数係数の `4` などは置換しない）。
  5. ズーム閾値・LOD 閾値・密度スケール係数のリテラル（subtask 1 で除外済み）は置換しない。必要に応じ `// zoom-adaptive, intentionally inline` 等の 1 行注釈を追加してよいが、最小限に留める。
  6. 禁止ファイル変更厳守: `src/views/EdgeRenderer.ts`, `src/views/RenderPipeline.ts`, `src/views/node-decorations.ts` には触らない。
  7. 変更をコミットする（まだ lint/test は次の subtask で行う）。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
