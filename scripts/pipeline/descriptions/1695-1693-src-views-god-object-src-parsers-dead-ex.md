## Description (subtask of 1693-dead-exports)

`pnpm dlx knip --include exports` で `src/views/` (ただし GOD object 4ファイル
  GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts
  には触れない) と `src/parsers/` 配下の dead exports を抽出する。
  各 export について:
    - 同ファイル内で使用されている → `export` を外す
    - 未使用 → 削除
    - テストのみで使用 → 維持
  GOD object 内の dead exports は別タスクで扱うので本タスクではスキップする
  (CLAUDE.md の「Do NOT grow them」方針に従い、行数を減らす方向のみだが、
   行削減は extract 専用タスクに任せる)。
  確認:
    - `pnpm test` グリーン
    - `pnpm lint` グリーン
    - `pnpm build` 成功 + bundle 800KB 以下

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
