## Description (subtask of 1470-type-assertions)

panel-defaults.ts (19件), panel-sections.ts (13件), panel-sections-edge-display.ts (6件),
  panel-sections-node-display.ts (5件) の合計43件を精読し、10件以下に削減する。
  - 設定オブジェクトのデフォルト値キャスト (`{} as PanelState`) は型注釈
    `const defaults: Partial<PanelState> = { ... }` に変換
  - イベントハンドラ内の `e.target as HTMLInputElement` は `instanceof` ガードに置換
  - keyof キャスト (`key as keyof T`) は型述語ヘルパー
    `function isKeyOf<T>(obj: T, k: string): k is keyof T & string` を新設し置換
  - 共通の型ヘルパーは src/views/panel-types.ts (新規 or 既存) に追加
  GraphViewContainer.ts および他ファイルは触らないこと。
  完了条件: 上記4ファイル合計の `as [A-Z]` 件数が 10 以下、
  `pnpm test` および `pnpm lint` が PASS。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
