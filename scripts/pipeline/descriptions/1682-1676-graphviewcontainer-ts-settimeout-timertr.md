## Description (subtask of 1676-settimeout-leaks)

`src/views/GraphViewContainer.ts` を grep して `setTimeout(` 呼び出し箇所をすべて列挙する。
  各呼び出しについて以下のいずれかに分類して対応する:
  - 既に対応する `clearTimeout` がある (ID をフィールド保持しているケース) → 触らない
  - 未クリア →

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
