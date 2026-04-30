## Description (subtask of 1417-type-assertions)

対象5ファイル内の `as unknown as T` / `as any` / `as HTMLElement` / `as HTMLInputElement` 等の型アサーションを、可能な限り以下の方法で除去する:
  - `el.createEl('div')` を `el.createEl<'div'>('div')` または戻り値を直接使うパターンに変更
  - DOM要素は `instanceof HTMLInputElement` 型ガードで絞り込む
  - 関数引数/返り値の型を正しく定義し直す (Partial<T>, Pick<T, K> 等)
  - `as any` で隠していた型不整合は、関数シグネチャ修正か型定義側の追加プロパティで解決
  GraphViewContainer.ts には**触れないこと** (God Object)。
  完了条件: 上記5ファイルの `as ` キャスト件数が現状の半分以下になる、`pnpm test` および `pnpm lint` が通る、`pnpm build` が成功する。
  報告には「修正前 X 箇所 → 修正後 Y 箇所」の実測値のみ書くこと (効果見込み禁止)。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
