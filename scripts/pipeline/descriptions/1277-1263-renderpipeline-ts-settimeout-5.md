## Description (subtask of 1263-settimeout-leaks)

src/views/RenderPipeline.ts の setTimeout 7サイトを精読し、未クリアの 5サイトを特定する。
  ハンドルをインスタンスフィールド (例: `private _pendingTimeouts: Set<number>`) に登録し、
  `destroy()` / 既存のクリーンアップメソッドで `clearTimeout` する。
  既存のclearTimeout 2サイトの管理パターン (どのフィールドに格納しているか) を踏襲すること。
  CLAUDE.md の "RenderPipeline.ts Max 2476行" を超えないよう、ロジック追加は最小に留める。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
