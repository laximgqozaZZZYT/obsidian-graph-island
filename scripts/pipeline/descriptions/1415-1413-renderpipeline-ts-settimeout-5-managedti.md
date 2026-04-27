## Description (subtask of 1413-settimeout-leaks)

src/views/RenderPipeline.ts (setTimeout 7箇所, clearTimeout 2箇所) の未クリア 5箇所を
  ManagedTimers 経由に置換する。

  手順:
  1. `Grep -n setTimeout\\(` と `Grep -n clearTimeout\\(` で全箇所を列挙し、
     既に handle を保持して clear している 2箇所を特定する。残り5箇所が対象。
  2. RenderPipeline は GraphViewContainer から生成される。コンストラクタで
     `ManagedTimers` インスタンスを受け取るよう signature を拡張する
     (既に this.managedTimers 等の field がある場合はそれを使う)。
     呼び出し元の GraphViewContainer 側で既存の ManagedTimers を渡す。
  3. 残り5箇所の `setTimeout(fn, ms)` を `this.managedTimers.setTimeout(fn, ms)` に置換。
  4. RenderPipeline.ts は God Object (Max 2657行)。**1行も増やさないこと**。
     コンストラクタ引数追加・field追加で行が増えそうな場合は、別途未使用行/重複の
     削除でオフセットする。事前に `wc -l src/views/RenderPipeline.ts` で baseline を
     測定し、変更後も同値以下であることを確認する。
  5. `pnpm test` がグリーンであることを確認してコミット。

`★ Insight ─────────────────────────────────────`
- RenderPipeline は Max 2657 で頭打ち。bare setTimeout を managed 版に置換する際、`setTimeout(` → `this.managedTimers.setTimeout(` は1行内で完結するので line count は基本変わらない。コンストラクタ引数追加だけ気をつければよい。
- 既に clear している 2箇所は触らないこと (handle を捨てて managed 版に置換すると clear 側が orphan になる)。
`─────────────────────────────────────────────────`

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
