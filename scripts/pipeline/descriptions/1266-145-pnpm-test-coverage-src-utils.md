## Description (subtask of 145-coverage-drop)

1. `pnpm test:coverage` を実行し、`coverage/coverage-summary.json` から statements/functions カバレッジが低い `src/utils/` 配下のファイルを精読して特定する。
  2. 特定したファイルのうち、純粋関数として export されているもの（または容易に export 可能なもの）を対象にユニットテストを `tests/utils/` 配下に新規追加する。
  3. テストは vitest で記述し、`tests/__mocks__/obsidian.ts` を必要に応じて利用する。
  4. 対象ファイル本体（`src/utils/*.ts`）のロジックは変更しない。export 追加が必要な場合のみ最小限の変更を許容する。
  5. `pnpm test` がパスし、`pnpm test:coverage` で statements/functions のいずれかが上昇することを確認する。
  6. GOD OBJECT 4ファイル（GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts）は触らない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
