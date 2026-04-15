---
priority: medium
reported: 2026-04-16
status: pending
source: decomposed
parent: 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: subtask
---

## Description (subtask of 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

これで全体像が分かりました。親issueは `as HTMLElement` 型アサーションの削減です。現状のDOMキャスト箇所を整理して、ファイル別に分解します。

`★ Insight ─────────────────────────────────────`
- `as HTMLElement` はTypeScriptの型チェックをバイパスし、実行時にプロパティが存在しない場合のエラーを隠す
- 安全な代替: `instanceof HTMLElement` チェック、`querySelector<HTMLElement>()` のジェネリック型引数、DOM APIの返り値型の正確な利用
- God Objectファイル（GVC, PanelBuilder）は行数上限があるため、修正でも行数を増やさない工夫が必要
`─────────────────────────────────────────────────`

以下がファイル別の `as HTMLElement` 分布です：

| ファイル | 箇所数 |
|---------|--------|
| `panel-sections.ts` | 7 |
| `PanelBuilder.ts` | 12 |
| `GraphViewContainer.ts` | 8 |
| `matrix-renderer.ts` | 4 |
| `DiffOverlay.ts` | 3 |
| `panel-widgets.ts` | 1 |
| `RenderPipeline.ts` | 1 |
| その他(coord-panel, thumbnail, main) | 3 |

God Object制約を考慮し、行数が増えにくい小ファイルから着手する分解にします。

---

## タスク分解結果

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
