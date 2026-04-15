---
priority: high
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask
depends: subtask-1
summary: PanelBuilder.ts の e.target as HTMLElement をinstanceof型ガードに置換 (2箇所) + テスト
---

## Description (subtask of 224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask)

event.target の as HTMLElement を安全な型ガードに置換:

  L1763: if ((e.target as HTMLElement).tagName === "INPUT") return;
  →  if (e.target instanceof HTMLElement && e.target.tagName === "INPUT") return;

  L2060: if ((e.target as HTMLElement).closest(".gi-section-help")) return;
  →  if (e.target instanceof HTMLElement && e.target.closest(".gi-section-help")) return;

  検証:
  - pnpm build 成功
  - pnpm lint 通過
  - pnpm test 全パス
  - PanelBuilder.ts 内に as HTMLElement が0件であることを grep で確認
```

---

2タスクに分けた理由：
- **Subtask 1** はジェネリック型パラメータへの機械的な置換（10箇所）
- **Subtask 2** はロジックの変更を伴う型ガード導入（2箇所）＋最終検証。`instanceof`チェックによりnullish `e.target`の場合の挙動が変わるため、Subtask 1の安全な変更が先に通ることを確認してから行う

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
