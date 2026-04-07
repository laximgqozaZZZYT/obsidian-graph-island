---
priority: high
reported: 2026-04-07
status: pending
summary: PanelBuilder.ts (2945行) からセクションビルダーを純粋関数として抽出
---

## Description

`src/views/PanelBuilder.ts` は God Object policy 対象で、現在 2945 行 (上限 4377)。直近6時間で eslint focus が支配的で refactor focus が回らず、God Object 分解の進捗が止まっている。

最も切り出しやすい候補:
- `buildLayoutSection` 系
- `buildEdgeStyleSection` 系
- `buildSearchSection` 系
- `buildExportSection` 系

各セクションは UI 構築の連続呼び出しで、内部状態への依存が比較的浅い。

## Acceptance criteria

- [ ] PanelBuilder.ts から **少なくとも1つのセクションビルダー**を新ファイルに抽出 (例: `src/views/panel-sections/edge-style-section.ts`)
- [ ] 抽出後の PanelBuilder.ts 行数が **少なくとも 100 行減少**
- [ ] 抽出した関数は可能な限り pure (引数で依存を受け取り、return で結果を返す)
- [ ] 既存テストがすべてグリーン (`pnpm test`)
- [ ] eslint clean (`pnpm lint`)
- [ ] 抽出したセクションに対する unit test を新規追加 (最低3ケース)

## Non-goals

- 全セクションを一度に分解する必要はない (1セッションで1セクションでよい)
- 既存の動作変更 (機能追加・削除)
