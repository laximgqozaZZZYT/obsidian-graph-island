## Description (subtask of 1491-settimeout-leaks)

subtask-1 の audit ファイルで特定された未クリア setTimeout を、既存の ManagedTimers
  ユーティリティ(RenderPipeline.ts で導入済みのパターン)または this.registerInterval/
  this.register(() => clearTimeout(id)) の Obsidian Component lifecycle 経由に置換する。
  GOD OBJECT ポリシー遵守: GraphViewContainer.ts は 8655 行、PanelBuilder.ts は 2216 行、
  EdgeRenderer.ts は 2765 行を超えないこと。新規ヘルパーが必要なら src/utils/managed-timers.ts
  などへ抽出する。受け入れ基準は `grep -c 'setTimeout(' src/**/*.ts` から
  `grep -c 'clearTimeout(' src/**/*.ts` を引いた差が 10 以下。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
