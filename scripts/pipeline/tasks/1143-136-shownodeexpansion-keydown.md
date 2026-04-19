---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 136-expansion-keydown-leak
depends: none
summary: _showNodeExpansion冒頭で古いkeydownリスナーを除去してから新規登録
---

## Description (subtask of 136-expansion-keydown-leak)

`src/views/GraphViewContainer.ts` の `_showNodeExpansion()` (line 3086-3144) を修正:
  - line 3087-3088 の古い `.gi-node-expand` DOM 除去の直後に、
    `if (this._expansionKeyHandler) { document.removeEventListener('keydown', this._expansionKeyHandler); this._expansionKeyHandler = null; }`
    を追加して、前回登録された handler を必ず document から除去する
  - line 3141 で新 handler を `this._expansionKeyHandler` に代入する前にクリーンアップが済んでいる状態にする
  - `onClose()` (line 1865-1868) の既存クリーンアップはそのまま維持
  - GraphViewContainer.ts は god object のため、追加は必要最小限（3-5行）に留める。Max Allowed 8580 行を超えないこと
  - CLAUDE.md 禁止事項（console.*、hardcode、location.reload）に抵触しないこと

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
