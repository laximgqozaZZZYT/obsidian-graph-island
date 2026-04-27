## Description (subtask of 1371-type-assertions)

`src/views/GraphViewContainer.ts` には `as unknown as X` パターンが 27 件存在する (このリポジトリで最多)。
  Obsidian app/workspace/leaf 等の internal access、PixiJS object の untyped property access が主因。
  作業内容:
  1. 27件を `git grep -n " as unknown" src/views/GraphViewContainer.ts` で列挙する
  2. 同一パターンの繰り返し (例: `(this.app as unknown as { commands: ... }).commands`) を、新規ファイル `src/views/internal-types.ts` (または既存 `src/obsidian-internals.ts`) に集約した型定義 + 1 箇所のアクセサ関数に置き換える
  3. PixiJS object の untyped access は対応する PixiJS の正規型 (`Container`, `Sprite`, `Graphics`) を import して使用する
  GOD OBJECT 制約: `GraphViewContainer.ts` は 8652/8655 行 — **行数を増やしてはならない**。コード集約により純減を狙う。新規ファイル `internal-types.ts` 側で型を持つ。
  受け入れ基準: GVC の `as unknown` 件数を 27 → 5件以下、GVC の総行数を現状以下、vitest 全 PASS。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
