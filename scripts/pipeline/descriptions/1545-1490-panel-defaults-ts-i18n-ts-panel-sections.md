## Description (subtask of 1490-type-assertions)

3ファイル合計約40件の型アサーションを除去する。
  
  src/views/panel-defaults.ts (19件):
    - `[] as PanelState["subgraphStack"]` パターン (15件超) を、
      defaults オブジェクトに `Partial<PanelState>` 型注釈を付けることで
      アサーションなしに書き換える。
    - `"node" as NodeDisplayMode` のような文字列リテラル + 型アサーションは、
      defaults を `Partial<PanelState>` で型付けすれば不要になる。
  
  src/views/panel-sections.ts (13件):
    - `(panel as unknown as Record<string, unknown>)[key] = v` パターンを、
      EDGE_TYPE_KEYS の `keyof PanelState` 型付けに変更し、
      型アサーションなしのアクセスに置換する。
    - `v as NodeShape` などはチェックボックス/セレクトの値型を `NodeShape` で
      ジェネリック型付けしたヘルパーを介す形に変更。
  
  src/i18n.ts (8件):
    - 翻訳キーレコードの `as Record<...>` を、定数宣言時に直接型注釈する形に変更。
  
  目的: 該当3ファイルから型アサーションを除去し、合計を最低 30 件以上削減する。
  完了条件: `pnpm test` PASS, `pnpm lint` PASS, `pnpm build` 成功。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
