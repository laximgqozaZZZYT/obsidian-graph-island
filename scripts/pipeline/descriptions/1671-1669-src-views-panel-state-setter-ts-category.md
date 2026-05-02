## Description (subtask of 1669-dead-exports)

`tmp/dead-exports-report.md` の Category C セクションから
  `src/views/panel-state-setter.ts` に該当する26件のシンボル (line番号つき) を抽出する。
  該当する `export` 宣言を宣言ごと削除する。
  
  削除前に各シンボルが `src/` 内 (テスト除く) で未参照であることを `Grep` で確認すること。
  もしテストからの参照がある場合は Category A であり、削除せずスキップ。
  
  panel-state-setter.ts は GraphViewContainer.ts (God Object) と密に関連するため、
  削除後に GraphViewContainer.ts のビルドエラーが出ないことを必ず確認する。
  
  完了基準:
  - `pnpm build` 成功
  - `pnpm test` PASS
  - C カウント減少を `node scripts/list-dead-exports.mjs` で確認
  
  GraphViewContainer.ts 等の他ファイルは触らないこと (God Object 増行禁止)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
