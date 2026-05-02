## Description (subtask of 1632-settimeout-leaks)

`src/views/panel-widgets.ts` 内の以下 5 箇所の生 `setTimeout(...)` 呼び出しを、
  既存の `ManagedTimers` 経由 (`ctx.timers.setTimeout(...)`) に置換する。
  対象行: 209, 862, 1069, 1226, 1260 (いずれも blur/input/focus デバウンス用、
  150〜200ms の遅延、現状 `clearTimeout` ペア無し)。

  手順:
  1. 各関数のシグネチャを確認し、`ctx: PanelContext` がスコープに無い場合は
     呼び出し元から `ctx` を伝播させる (関数引数追加)。`PanelContext` は既に
     `timers: ManagedTimers` を持つ。
  2. `setTimeout(fn, ms)` → `ctx.timers.setTimeout(fn, ms)` に置換。
  3. 返値 handle が必要なケースでは `let h: ReturnType<typeof setTimeout> | null = null;`
     のような近接ローカル変数に保持し、再入時に `ctx.timers.clear(h)` でクリアする。
  4. `pnpm test` (vitest) を流し、関連テストがあれば PASS を確認。
  5. `pnpm lint` と `pnpm format:check` を通す。

  注意: panel-widgets.ts は God Object 対象外。新規ファイル抽出は不要。
  Forbidden Pattern: `console.*` を入れない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
