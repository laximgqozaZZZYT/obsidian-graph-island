## Description (subtask of 1364-dead-exports)

`pnpm exec ts-prune` で dead exports 一覧を取得し、src/views/ 配下のファイル
  (ただし CLAUDE.md で指定された 4 つの god object ファイルは除外) に該当する項目を抽出。
  対象例: renderer-factory.ts, CanvasGraphics.ts, CanvasText.ts, LabelManager.ts 等。
  各項目について

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
