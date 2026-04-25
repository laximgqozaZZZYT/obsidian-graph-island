
## Description (subtask of 1161-140-panelbuilder-createdefaultpanel-179)

tests/views/panel-defaults.test.ts を新規作成し、以下を検証:
    - DEFAULT_FILTER_STATE / DEFAULT_DISPLAY_STATE / DEFAULT_LAYOUT_STATE /
      DEFAULT_TOOLBAR_STATE の shape を toMatchSnapshot() で固定
    - createDefaultPanelState() の返り値 shape も toMatchSnapshot() で固定
    - createDefaultPanelState() が呼び出しごとに独立したオブジェクトを返す
      (参照共有していない) ことを expect(a).not.toBe(b) で検証
    - createDefaultPanelState() が純粋であること (同一入力で deep-equal な結果)
  tests/__mocks__/obsidian.ts は既存のものを利用。pnpm test で全て通ること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
