## Description (subtask of 1427-dead-exports)

`.autonomous/dead-exports-list.md` を読み、分類タグが [type] または [const] の行のみを対象にする
  (function/class は副作用の可能性があるので subtask-3 に回す)。
  各 export について以下のいずれかを実施:
  - **完全に未使用** (型定義含めて他で参照されない) → 該当行ごと削除
  - **モジュール内で使われている** → `export` キーワードを外して private 化
  PanelBuilder.ts / GraphViewContainer.ts / EdgeRenderer.ts / RenderPipeline.ts の
  god object 4ファイルは触らない (CLAUDE.md の Max Allowed 制約あり)。
  変更後:
  - `pnpm tsc --noEmit` が通ること
  - `pnpm test` が通ること
  - `pnpm find-dead-exports` を再実行し、削減数を `.autonomous/dead-exports-list.md` 末尾に
    `## After subtask-2: N exports removed` として追記
  受け入れ基準: dead exports 件数が 70件以下に減っていること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
