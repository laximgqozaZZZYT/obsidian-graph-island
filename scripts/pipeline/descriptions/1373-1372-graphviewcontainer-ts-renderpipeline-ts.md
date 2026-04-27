## Description (subtask of 1372-settimeout-leaks)

GraphViewContainer.ts (13箇所) と RenderPipeline.ts (12箇所) の生setTimeout呼び出しを精読し、
  ライフサイクルバウンドな箇所を src/utils/managed-timers.ts の ManagedTimers#setTimeout 経由に
  置換する。両クラスのteardown(destroy/onClose相当)で ManagedTimers#clearAll() を呼んで
  保留中タイマーを全解放することを保証する。
  - 既に this.timers / this.timerRegistry 等のメンバーがあるかを最初に grep で確認し、
    なければ新設(private readonly timers = new ManagedTimers())。
  - GraphViewContainer.ts は god object のため、メソッド抽出ではなく
    `globalThis.setTimeout(` → `this.timers.setTimeout(` の置換に留め、
    Max Allowed (8655行) を超えないこと(置換は同数〜減少)。
  - 1回限りで意図的にライフサイクル外のもの(プラグインunload後のチェイン解除など)が
    あれば、その箇所のみ理由を1行コメントで明記して残す。
  - vitest を pnpm test で走らせ、既存テストが緑であること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
