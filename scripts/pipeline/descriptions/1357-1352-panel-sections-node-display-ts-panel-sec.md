## Description (subtask of 1352-broken-node-settings-cleanup)

`nodeSizeByDegree` UI トグルが `panel-sections.ts:21-28` と `panel-sections-node-display.ts:203-211` の 2 箇所に重複登録されている。ユーザーが見るパネルでどちらが描画されるかを確認し、片方を削除する。

  作業手順:
  1. `src/views/PanelBuilder.ts` を Read で開き、`buildNodeDisplaySection` 等から `panel-sections.ts` の関数 / `panel-sections-node-display.ts` の関数のどちらが呼ばれているかを特定。
  2. **両方呼ばれている**場合: `panel-sections.ts` 側 (古い実装と思われる) のトグル定義を削除。残すのは `panel-sections-node-display.ts:203-211` の advanced-controls 側。
  3. 削除した関数が `panel-sections.ts` で他に export されていないか確認し、未使用なら関数自体を削除 (i18n キーは残してよい)。
  4. テストファイル `tests/panel-sections.test.ts` で削除した関数を参照しているテストがあれば、対応する `tests/views/panel-sections-node-display.test.ts` 側に移行 or 削除。

  禁止事項:
  - i18n キー `display.nodeSizeByDegree` / `desc.nodeSizeByDegree` の翻訳テキストは削除しない (advanced 側で参照中)。
  - 既存テストの coverage 閾値を下げない。テスト削除する場合は対応する箇所に等価テストを残す。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
