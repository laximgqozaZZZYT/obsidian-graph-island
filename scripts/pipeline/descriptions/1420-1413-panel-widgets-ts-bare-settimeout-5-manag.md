## Description (subtask of 1413-settimeout-leaks)

`src/views/panel-widgets.ts` 内の bare `setTimeout` 呼び出し 5箇所を `ManagedTimers` 経由に置き換える。
  対象行（現状）:
    - 209: autocomplete blur 内 `setTimeout(() => (popup.style.display = "none"), 150)`
    - 862: query hint hide 内 `setTimeout(() => { ... dismissHint(); }, 150)`
    - 1069: suggestion blur 内 `setTimeout(() => { ... dismissHint(); }, 150)`
    - 1226: `setTimeout(ctx.rebuild, 50)`（既存 ctx 引数あり）
    - 1260: `setTimeout(ctx.dismiss, 200)`（既存 ctx 引数あり）

  実装方針:
    - 1226/1260 は ctx インターフェイスに `timers: ManagedTimers` フィールドを追加し、呼び出し元（PanelBuilder.ts 等）から `ctx.timers` を渡す。
    - 209/862/1069 は属する関数のシグネチャに `timers: ManagedTimers` パラメータを追加し、呼び出し元から `ctx.timers` を渡す。
    - 該当関数の全呼び出し元を grep で特定し、`ctx.timers` を引数に追加。
    - import 追加: `import type { ManagedTimers } from "../utils/managed-timers";`
    - すべての bare `setTimeout(...)` を `timers.setTimeout(...)` に置換。

  検証:
    - `pnpm build` がエラーなく通ること
    - `pnpm test` の既存テストが通ること
    - `pnpm lint` 通過

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
