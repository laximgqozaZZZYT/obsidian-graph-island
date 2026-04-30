## Description (subtask of 1583-dead-exports)

`node scripts/list-dead-exports.mjs` を実行し、`tmp/dead-exports-report.md` で
  src/views/EdgeRenderer.ts に該当する全エントリを抽出する。
  対応方針:
  - Category A の `classifyEdgePort` (line 508), `portLaneKey` (line 516) は
    テストで使われているため `export` を維持。変更しない。
  - Category B の38シンボル (定数/型/ヘルパー関数) は `export` キーワードを
    削除して同一モジュール内ローカルにする。型エイリアスは `export type` を
    `type` に置換。各シンボルについて `grep -rn "<symbol>" src/ tests/ e2e/`
    で同一モジュール外参照がないことを確認した上で削除すること。
  - Category C の `findPerimeterBranchPoint` (line 674) は完全未使用のため
    関数本体ごと削除する。

  CLAUDE.md GOD OBJECT 制約: EdgeRenderer.ts は Max 2765行。`export` 除去のみ
  では行数不変、未使用関数削除では行数減のため ratchet 違反は発生しない。

  検証:
  - `pnpm lint` (ESLint passing)
  - `pnpm test` (vitest 全PASS)
  - `node scripts/list-dead-exports.mjs` 実行後、EdgeRenderer.ts のエントリが
    Category A 2件のみに減少していること

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
