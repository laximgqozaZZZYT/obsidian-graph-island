## Description (subtask of 1328-settimeout-leaks)

src/views/panel-widgets.ts には clearTimeout が 0個に対し setTimeout が 5箇所
  存在し、いずれもコンポーネント破棄時にクリアされない。具体的な行:
    - L209: input.blur → popup hide
    - L862: hint hide deferred
    - L1069: input.blur → dismissHint deferred
    - L1226: query rebuild defer (50ms)
    - L1260: dismiss defer (200ms)
  PanelBuilder.ts で既に使われている `ctx.timers.setTimeout(...)`(ManagedTimers)
  パターンに合わせ、5箇所すべてを `ctx.timers.setTimeout()` 呼び出しに置換する。
  ctx が利用できない関数スコープの場合、引数として ctx か timers ハンドル
  (ManagedTimers) を受け取れるようシグネチャを最小限拡張する。
  完了条件:
    - setTimeout( のリテラル呼び出しが panel-widgets.ts に残っていない
    - pnpm build / pnpm test が PASS
    - panel-widgets.ts の行数増加が +20 行以下

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
