## Description (subtask of 1262-type-assertions)

panel-defaults.ts の 19 件の型アサーションは大半が `[] as PanelState["xxx"]` や `"node" as NodeDisplayMode` 形式の初期化値ヒント。これらは defaults オブジェクト自体に `: PanelState` の型注釈を付けることで TypeScript が文脈型推論を行い、全アサーションが不要になる。

  実装内容:
  1. `panel-defaults.ts` 内の defaults オブジェクト (PANEL_DEFAULTS 相当) の宣言を `export const PANEL_DEFAULTS: PanelState = { ... }` に修正。型注釈が無ければ追加。
  2. プロパティ毎の `[] as PanelState["foo"]` を `[]` に、`"node" as NodeDisplayMode` を `"node"` に置換 (TypeScript が親型から推論する)。
  3. `Record<string, string>` のような Record 型は既に文脈型推論で解決されるはずだが、推論が効かない箇所のみアサーション残置。
  4. `pnpm build` で型エラーが出ないこと、`pnpm test` が PASS することを確認。
  5.

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
