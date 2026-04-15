---
priority: high
reported: 2026-04-16
status: done
source: decomposed
parent: 167-162-133-type-assertions-dom-as-html-element-30-subtask
depends: none
summary: 小規模ファイル5件の as HTMLElement 型アサーションを instanceof ガードに置換
---

## Description (subtask of 167-162-133-type-assertions-dom-as-html-element-30-subtask)

以下5ファイルの型アサーションを安全な型ガードに置換する（計5箇所）:

  - src/main.ts:126 — querySelector結果の as HTMLInputElement | null → instanceof HTMLInputElement チェック
  - src/views/thumbnail-helpers.ts:29 — cloneNode() as HTMLImageElement → instanceof ガード
  - src/views/coord-panel.ts:712 — createEl() as HTMLTextAreaElement → 変数の型注釈で対応（Obsidian APIの戻り型確認）
  - src/views/RenderPipeline.ts:1735 — querySelector as HTMLElement | null → instanceof ガード
  - src/views/panel-widgets.ts:222 — items[selected] as HTMLElement → instanceof ガード

  各変更後 pnpm test && pnpm lint で確認。God Object には触れない。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
