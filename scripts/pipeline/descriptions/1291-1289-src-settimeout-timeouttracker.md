## Description (subtask of 1289-settimeout-leaks)

Step A (調査):
  - rg で `setTimeout\(` と `clearTimeout\(` の出現箇所を src/ 配下で列挙
  - 各 setTimeout について、同じファイル/同じ owner スコープ内に対応する clearTimeout が
    あるかを目視で分類: 「(a) 既に clear 済み」「(b) fire-and-forget 意図 (1ms タスクキュー化等)」
    「(c) 未クリア・要修正」
  - (c) のリストをコミットメッセージ本文に file:line で列挙
  Step B (置換):
  - (c) の各 call site を、所有 component が Component を継承していれば
    registerComponentTimeout(this, ...) に置換
  - そうでない長寿命オブジェクトは TimeoutTracker インスタンスを保持し、
    既存の destroy()/onunload() 相当に this.timeouts.clearAll() を追加
  - GraphViewContainer.ts / EdgeRenderer.ts / RenderPipeline.ts / PanelBuilder.ts は
    GOD OBJECT 上限超過禁止。1行追加につき1行削減できる範囲だけ触るか、
    超過する場合は触らず

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
