## Description (subtask of 1314-settimeout-leaks)

src/views/panel-widgets.ts (setTimeout 5箇所、clearTimeout 0箇所) と
  src/views/coord-panel.ts (setTimeout 2箇所、clearTimeout 0箇所) と
  src/views/panel-callbacks.ts (setTimeout 1箇所、clearTimeout 0箇所) を対象。

  各ファイルの setTimeout 呼び出しを精読し、以下のいずれかの方針で修正する:
  - モジュールスコープまたは関数スコープに `pendingTimers: Set<ReturnType<typeof setTimeout>>` を導入し、各 setTimeout の戻り値を add、コールバック完了時に delete
  - 既存の cleanup/destroy/unload 関数があればそこで全 timer を clearTimeout + clear
  - 該当ファイルに cleanup hook がない場合、呼び出し側 (PanelBuilder/GraphViewContainer) の onClose に渡せる関数を export

  対象 setTimeout が UI 即時反映用のごく短い (0ms / 16ms) もので、副作用が view 状態への破壊的更新を含む場合は必ず clear 対応すること。

  禁止事項:
  - GOD OBJECT 4 ファイル (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) は本タスクでは触らない
  - 機能変更は禁止 (clearTimeout の追加と timer ID 保持のみ)

  検証:
  - `pnpm build` 通過
  - `pnpm test` 通過
  - `pnpm lint` 通過
  - 修正後、対象3ファイルの setTimeout 呼び出しに対して clearTimeout が同数以上あること

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
