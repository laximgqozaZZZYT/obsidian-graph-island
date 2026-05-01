## Description (subtask of 1640-settimeout-leaks)

以下4ヶ所の raw `setTimeout(` を `ctx.timers.setTimeout(...)` に置換し、debounce 用ローカル変数が destroy 時に確実に clearTimeout されるよう調整する。
  
  対象 call-site:
  - `src/views/panel-sections-layout.ts:242` `debounceTimer = setTimeout(...)`
  - `src/views/panel-sections-layout.ts:675` `spacingDebounce = setTimeout(...)`
  - `src/views/panel-sections-layout.ts:782` `forceDebounce = setTimeout(...)`
  - `src/views/PanelBuilder.ts:813` `searchDebounce = setTimeout(...)`
  
  作業手順:
  1. 各 call-site の周辺コードを読み、debounce パターン (`if (X) clearTimeout(X); X = setTimeout(...)`) を確認
  2. `setTimeout(...)` 部分のみを `ctx.timers.setTimeout(...)` に置換（debounce の clearTimeout は残す — 既存の挙動を維持）
  3. これにより、debounce 中の pending timer が destroy 時に `ctx.timers.clearAll()` で確実にクリアされるようになる
  4. PanelBuilder.ts の他の call-site (840/1330/1346/1385) は既に ctx.timers を使用済み — 触らないこと
  5. `pnpm test` がグリーンのままであることを確認
  6. PanelBuilder.ts は Max Allowed=2216、行数増加は禁止（純粋な API 置換のみ）
  
  godobj 制約: PanelBuilder.ts は God Object 対象。**行数を1行も増やさないこと**。`setTimeout(` → `ctx.timers.setTimeout(` の置換は同行内で完結可能。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
