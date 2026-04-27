## Description (subtask of 1385-settimeout-leaks)

以下3ファイルは setTimeout 計8箇所すべてに対応する clearTimeout が無い。
  既存の `src/utils/timer-registry.ts` (または `managed-timers.ts`) を import し、
  `setTimeout(...)` を Registry 経由の登録呼び出しに置換する。各ファイルの
  Component/View が破棄されるタイミング (onClose / detach / 親 GVC からのクリーンアップ
  コールバック) で Registry.clearAll() 相当を呼ぶ。
  - panel-widgets.ts: setTimeout × 5 (デバウンス系の可能性大、handle を Registry に積む)
  - panel-callbacks.ts: setTimeout × 1
  - coord-panel.ts: setTimeout × 2
  破棄フックが panel 単独で持てない場合は、呼び出し側 (PanelBuilder) から
  cleanup ハンドルを受け取るパターンで結線する。本タスクでは API 追加は最小限とし、
  既存 Registry の使い回しを優先する。
  完了条件: 上記3ファイルで `setTimeout(` の生呼び出しが 0、`pnpm test` PASS、
  `pnpm lint` PASS、ビルドサイズ 800KB 内。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
