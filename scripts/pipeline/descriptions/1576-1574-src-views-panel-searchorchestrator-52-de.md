## Description (subtask of 1574-dead-exports)

対象内訳 (ts-prune 出力ベース):
    - panel-state-setter.ts: 26
    - SearchOrchestrator.ts: 10
    - panel-sections-layout.ts: 6
    - panel-sections-filter.ts: 6
    - panel-sections.ts: 3
    - panel-sections-filter-logic.ts: 1
    - panel-widgets.ts: 1
  GraphViewContainer.ts / PanelBuilder.ts は god object 指定のため
  これらのファイルへ symbol を移動してはならない。完全削除のみ。
  手順:
    1. 各ファイルについて `npx ts-prune | grep "<file>" | grep -v "used in module"`
       で対象シンボル一覧を取得。
    2. 各シンボルを Grep で src/ tests/ 全体検索し、import がないことを確認。
    3. 関数/定数本体ごと削除。テスト側で参照のみのケースはテストも削除。
    4. 削除後 `pnpm build` `pnpm test` `pnpm lint` を通す。
    5. PanelBuilder.ts や GraphViewContainer.ts の line count が
       増えていないことを確認 (god object 違反防止)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
