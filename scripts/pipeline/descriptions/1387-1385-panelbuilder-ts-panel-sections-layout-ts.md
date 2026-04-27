## Description (subtask of 1385-settimeout-leaks)

- PanelBuilder.ts: setTimeout × 5, clearTimeout × 1 → 約4件 unpaired
  - panel-sections-layout.ts: setTimeout × 4, clearTimeout × 3 → 約1件 unpaired
  既存 TimerRegistry / ManagedTimers を利用して未clearなハンドルを管理対象にする。
  PanelBuilder は God Object 候補 (上限 2216行) のため、ロジックを追加するのではなく
  既存 setTimeout 呼び出し行を置換するだけにとどめ、行数を増やさない。
  破棄ポイントは PanelBuilder 側の既存 cleanup / destroy (無ければ呼び出し元の
  GraphViewContainer から渡される dispose コールバックに繋ぐ) を再利用する。
  完了条件: 該当2ファイルで `setTimeout(` の総数 ≤ `clearTimeout(` の総数、
  `pnpm test` PASS、`pnpm lint` PASS、PanelBuilder.ts は現行行数以下を維持。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
