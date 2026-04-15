---
priority: high
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask
depends: none
summary: PanelBuilder.ts フィルタリング関数の as HTMLElement をinstanceofガードに置換 (6箇所)
---

## Description (subtask of 224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask)

L1142-1156のセクションフィルタリング処理で、Element→HTMLElementキャストを
  instanceofガードに置換する。対象6箇所:
  - L1142: (item as HTMLElement).textContent → instanceof チェック後にアクセス
  - L1143: (item as HTMLElement).style.display → 同上
  - L1151: (c as HTMLElement).style.display → 同上
  - L1153: (sec as HTMLElement).style.display → 同上
  - L1156: (c as HTMLElement).style.display → 同上
  
  パターン: for文/Array.from内でinstanceof HTMLElementガードをかけ、
  型が合わない要素はスキップ(continue)する。
  既存テストがあればpnpm testで回帰確認。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
