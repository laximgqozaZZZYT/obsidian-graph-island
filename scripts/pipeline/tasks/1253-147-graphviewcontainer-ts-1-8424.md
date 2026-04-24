---
priority: high
reported: 2026-04-25
status: blocked
source: decomposed
parent: 147-god-object-violation
depends: none
summary: GraphViewContainer.ts から末尾の小規模ヘルパーを 1 つ新ファイルに抽出して 8424 行以下に戻す
---

## Description (subtask of 147-god-object-violation)

`src/views/GraphViewContainer.ts` は現在 8427 行で CLAUDE.md の Max Allowed 8424 を 3 行超過している。
  以下の手順で対応する:
  1. `src/views/GraphViewContainer.ts` を先頭から末尾まで精読し、GraphViewContainer のメンバ変数や `this` を参照しない純粋関数、もしくは1箇所からしか呼ばれていない小さなプライベートメソッドを 1 つ特定する。候補例: 小さな算術ヘルパー、文字列整形、座標変換、配列フィルタ等。
  2. 新規ファイル `src/views/container-helpers/<helper-name>.ts` を作成し、そこに抽出する (GOD OBJECT 一覧に入っていない新ファイルなので肥大化違反にならない)。
  3. GraphViewContainer.ts からは該当コードを削除し、`import` で使用箇所を差し替える。
  4. 抽出後の `src/views/GraphViewContainer.ts` の行数が 8424 以下になっていることを `wc -l` で確認する。
  5. `pnpm lint` と `pnpm test` (vitest) を実行し、すべて PASS することを確認する。
  
  制約:
  - ロジック変更は禁止。単純な move + import のみ。
  - GOD OBJECT policy の他3ファイル(PanelBuilder / EdgeRenderer / RenderPipeline)は触らない。
  - `src/views/GraphViewContainer.ts` を現状より増やす変更 (コメント追加等) は禁止。
  - `pnpm test` の coverage しきい値を下げない。

`★ Insight ─────────────────────────────────────`
- CLAUDE.md の "Max Allowed = current line count. Ratchet down only." は、行数の単調減少を保証するラチェット機構。こうした機械的ゲートは、God Object を自然に解体していく圧力になる。
- +3 行程度の軽度超過でも、修正方針は常に "抽出" で統一すること (コメント削減やワンライナー圧縮は局所的な逃げであり、根本解決にならない)。
- `container-helpers/` のような新しい名前空間を作ると、今後他の純粋関数も同じ場所に集約でき、次回以降の抽出先に困らなくなる。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
