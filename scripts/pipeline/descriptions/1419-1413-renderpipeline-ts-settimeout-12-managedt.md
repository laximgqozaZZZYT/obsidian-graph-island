## Description (subtask of 1413-settimeout-leaks)

src/views/RenderPipeline.ts には setTimeout=12 / clearTimeout=2 で
  +10 の不均衡がある。本ファイルは God Object 指定 (Max Allowed 2657)
  のため、Forbidden Patterns により行数を増やしてはならない。
  手順:
  1) 12 箇所すべての setTimeout を Read → 用途分類
     (debounce / retry / next-frame 代用 / cleanup-after-render 等)。
  2) RenderPipeline がフィールドとして持っている (もしくは GVC から
     渡されている) ManagedTimers / TimerRegistry を特定する。
     存在しなければ既存の GVC 側のレジストリをコンストラクタ経由で
     受け取る形に変更する。
  3) 各 setTimeout(fn, ms) を `<registry>.setTimeout(fn, ms)` 形式に
     1:1 置換する (基本的に行数は不変)。手書きの clearTimeout も
     レジストリの clear / clearAll に統一。
  4) RenderPipeline の destroy / dispose 経路で clearAll が確実に
     呼ばれることを確認。なければ呼び出しを足すが、ファイル合計
     行数は 2657 以下を維持する。
  5) pnpm build / pnpm test / pnpm lint がグリーン。
  制約: 新規 export / 新規クラス追加で行数を増やさない。
  ロジック自体は変更しない (純粋にトラッキング層への差し替え)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
