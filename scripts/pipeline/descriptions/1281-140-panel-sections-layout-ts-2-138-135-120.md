## Description (subtask of 140-giant-functions)

`panel-sections-layout.ts:641 buildAutoFitAndGuides` (138行) と
  `panel-sections-layout.ts:781 buildSpacingAndGroupArrangement` (135行) を
  120行以下に縮小する。

  手順:
  1. `src/views/panel-sections-layout.ts` を Read して両関数の責務単位を特定する
     (例: AutoFit セクション / Guides セクション、Spacing セクション / GroupArrangement セクション)。
  2. 新規ファイル `src/views/panel-sections-layout-helpers.ts` を作成し、
     各セクション描画ブロックを `addAutoFitSection(...)`, `addGuidesSection(...)`,
     `addSpacingSection(...)`, `addGroupArrangementSection(...)` 等の
     純粋ヘルパー関数として export する。
  3. 元の関数からはヘルパー呼び出しのみ残す形に置き換える。
  4. 既存テスト (`pnpm test`) と `pnpm lint`, `pnpm build` を通す。
  5. 関数行数を再計測し、両関数とも ≤120行 になっていることを確認する。

  ルール:
  - 既存の i18n キー、設定キー、副作用 (settings 書き込み, refresh コール) を一切変えない。
  - GOD OBJECT (PanelBuilder.ts / GraphViewContainer.ts) には触らない。
  - magic number は導入せず、既存の RenderThresholds / settings 経由を維持する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
