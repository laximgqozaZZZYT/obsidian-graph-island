
## Description (subtask of 133-type-assertions)

`e.target as HTMLInputElement` / `as HTMLSelectElement` などの DOM キャスト（合計32箇所程度）を、`src/utils/` に追加する小さな型ガード `isInputElement()` / `getInputValue(e: Event): string | null` / `getCheckedValue(e: Event): boolean` などのヘルパーで置換する。
  新規ヘルパーファイルは 80行以下に抑え、god object を肥大化させない。
  - 対象: panel-sections.ts(15), panel-sections-edge-display.ts(8), panel-sections-node-display.ts(5), panel-sections-layout.ts(4)
  - 検証: `pnpm test`, `pnpm lint`, vault で設定パネル操作を確認
  - 期待削減: 約30箇所

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
