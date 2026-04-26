## Description (subtask of 140-giant-functions)

`panel-sections-filter.ts:1015 _buildCardSubSettings` (138行) を 120行以下に縮小する。

  手順:
  1. `src/views/panel-sections-filter.ts` の該当関数を Read し、
     カードサブ設定のサブブロック (例: 表示項目選択 / フィルタ条件 / 並び替え 等) を特定する。
  2. 新規ファイル `src/views/panel-sections-filter-card-helpers.ts` を作成し、
     各サブブロックを `addCardDisplayOptions(...)`, `addCardFilterRules(...)`,
     `addCardSortControls(...)` 等のヘルパー関数として export する。
  3. 元の `_buildCardSubSettings` からはヘルパー呼び出しのみ残す。
  4. `pnpm test`, `pnpm lint`, `pnpm build` を通す。
  5. 行数再計測で ≤120行 を確認する。

  ルール:
  - i18n キー / 設定キーの追加/変更禁止。
  - GOD OBJECT に触らない。
  - private メソッドの参照関係は維持 (this バインドが必要なら関数引数として渡す)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
