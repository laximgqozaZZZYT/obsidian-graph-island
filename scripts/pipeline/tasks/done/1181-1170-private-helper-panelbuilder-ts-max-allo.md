---
priority: high
reported: 2026-04-24
status: done
source: decomposed
parent: 1170-1164-buildnodestab-ctx-4-40
depends: subtask-2
summary: 未使用 private helper 削除 + PanelBuilder.ts 行数の Max Allowed 以下検証
---

## Description (subtask of 1170-1164-buildnodestab-ctx-4-40)

1. `_buildNodesTab` 縮小により未使用になった PanelBuilder 内の private helper（`_buildNodesFilterRow`, `_buildDegreeSlider`, 類似の UI ビルダ系 helper）を `grep -n "this\._helperName"` で参照確認し、ゼロ参照のものを削除。
  2. 削除したヘルパーに紐付くだけの private field（onFilterChange cache 等）も併せて整理。
  3. `wc -l src/views/PanelBuilder.ts` で総行数が 2216 以下であることを確認。超えていれば追加の inline ロジックをセクションファイルへ移動する余地を探す（ただし本タスクでは新規セクションファイル作成は不可、あくまで削除のみ）。
  4. `pnpm build && pnpm test && pnpm lint` を実行し全てグリーンを確認。
  5. `pnpm format` でフォーマットを整える。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
