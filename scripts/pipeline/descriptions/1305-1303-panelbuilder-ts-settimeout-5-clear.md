## Description (subtask of 1303-settimeout-leaks)

src/views/PanelBuilder.ts には setTimeout 6個に対して clearTimeout が 1個しかない。
  既存の clear ロジックを活かしつつ、未追跡の setTimeout 呼び出しを `Set<ReturnType<typeof setTimeout>>`
  に登録するヘルパー経由に統一する。パネル破棄/リビルド時の cleanup フック (既存の destroy/dispose 相当)
  で Set を反復して clearTimeout し、最後に Set.clear() する。
  GOD OBJECT Policy によりファイル肥大化禁止 — 既存メソッド内置換のみ、新規ヘルパーは1メソッドに収める。
  完了条件: PanelBuilder.ts 内の setTimeout 呼び出し全てが追跡される、pnpm test が pass する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
