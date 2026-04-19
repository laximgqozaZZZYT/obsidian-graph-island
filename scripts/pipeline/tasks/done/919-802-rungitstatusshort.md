---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 802-769-subtask
depends: subtask-1
summary: runGitStatusShort のユニットテスト追加
---

## Description (subtask of 802-769-subtask)

新規ファイル `tests/utils/git-status.test.ts` を作成し、以下のケースをカバー:
  - 正常系: モックした exec が `" M file.ts\n?? newfile.ts\n"` を返した場合、文字列そのまま返却
  - 空出力: クリーンなリポジトリで空文字列返却
  - 異常系: exec が error を throw した場合、Promise reject
  - cwd パラメータが exec に正しく渡されること
  - `child_process` は vi.mock でモック（tests/__mocks__ スタイル踏襲）
  - coverage ratchet に貢献するため分岐を網羅
  - `pnpm test` で通過することを確認

`★ Insight ─────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
