## Description (subtask of 145-coverage-drop)

src/views/CableTrayRenderer.ts は coverage 43.06% (613 stmt) で低い。
  下記4つの export 済み純粋関数に対して、既存の tests/cable-tray-routing.test.ts または
  tests/cable-tray-renderer.test.ts に境界値テストを追加する:
    - routeViaPolarGrid(grid, port, ...): 空 grid / 単一行 / 全埋まり / port外 の4ケース
    - buildPortColorLanes(ports, colors): port無し / 単色 / 多色 / 重複 の4ケース
    - cableFadeByDegree(deg, cfg): deg=0 / deg=1 / deg=N / cfg無効 の4ケース
    - cableWeightThickness(edges, cfg): edges空 / 単一 / 重み一様 / 重み混在 の4ケース
  src/views/CableTrayRenderer.ts は変更しない (テスト追加のみ)。
  追加後 pnpm test が PASS することを確認しコミット。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
