---
priority: medium
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 1158-140-panelbuilder-buildnodestab-318
depends: subtask-3
summary: panel-sections-nodes-tab の smoke test 追加
---

## Description (subtask of 1158-140-panelbuilder-buildnodestab-318)

`tests/views/panel-sections-nodes-tab.test.ts` を新規作成。
  各 build*Section 関数に対し DOM 組立 smoke test を追加:
    - tabEl (mock HTMLElement) を渡し、function が throw しない
    - 期待される子要素が生成される (querySelector で検証)
    - ctx callback が対応する UI 操作で呼ばれる
  既存の tests/views/panel-sections-*.test.ts パターンに倣う。
  `tests/__mocks__/obsidian.ts` の最小 mock を使用。
  `pnpm test` 通過を確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
