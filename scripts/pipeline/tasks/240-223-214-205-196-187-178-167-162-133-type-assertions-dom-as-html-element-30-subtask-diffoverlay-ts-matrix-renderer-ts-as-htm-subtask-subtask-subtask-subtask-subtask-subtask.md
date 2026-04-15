---
priority: medium
reported: 2026-04-16
status: pending
source: decomposed
parent: 223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask
depends: none
summary: subtask
---

## Description (subtask of 223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask)

全体像を把握しました。`DiffOverlay.ts` に3箇所、`matrix-renderer.ts` に6箇所の `as HTMLElement` があります。これは小さいタスクなので、1〜2サブタスクに収まります。

---

`★ Insight ─────────────────────────────────────`
- `as HTMLElement` の多くは `querySelectorAll` や `children` の返り値が `Element` 型であるため発生する。`instanceof HTMLElement` ガードや、適切な型引数付きの `querySelector<T>` を使えば安全に置換できる。
- `closest()` は既にジェネリック版 `closest<T>()` をサポートしているので `closest<HTMLElement>("td, th")` で直接型付けが可能。
`─────────────────────────────────────────────────`

---

## タスク分解結果

このissueは2ファイル・合計9箇所の小規模変更なので、**1タスク**で完了可能です。

---

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
