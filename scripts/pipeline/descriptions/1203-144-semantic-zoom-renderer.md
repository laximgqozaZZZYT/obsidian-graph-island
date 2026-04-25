
## Description (subtask of 144-coverage-drop)

`src/views/semantic-zoom-renderer.ts` は 0% カバレッジ、`renderSemanticZoomMode(...)` 1関数のみ。
  `tests/semantic-zoom-renderer.test.ts` を作成し:
  - `{ nodes: [], edges: [] }` + モック ctx（HTMLCanvasElement の getContext は jsdom で利用可）で crash しないこと
  - viewMode が対象外（="force"）の時に早期 return すること
  - ズームレベル境界値（0.5 / 1.0 / 10）で呼んでも throw しないこと
  - ノード 3〜5個・エッジ 2〜3本のミニケースで描画メソッド（fillRect / beginPath など）が N 回以上呼ばれること（jest.fn スパイ）
  既存の `tests/canvas-graphics.test.ts` の ctx モックパターンを参考に。
  目標: 6〜8テストケース、このファイル stmts 0%→70%+。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
