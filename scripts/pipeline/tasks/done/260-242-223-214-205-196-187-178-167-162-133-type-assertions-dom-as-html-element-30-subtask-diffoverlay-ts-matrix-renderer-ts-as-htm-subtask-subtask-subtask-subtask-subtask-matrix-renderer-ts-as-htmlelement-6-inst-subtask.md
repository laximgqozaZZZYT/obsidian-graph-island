---
priority: medium
reported: 2026-04-16
status: decomposed
source: decomposed
parent: 242-223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask-matrix-renderer-ts-as-htmlelement-6-inst
depends: none
summary: subtask
---

## Description (subtask of 242-223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask-matrix-renderer-ts-as-htmlelement-6-inst)

**このissueは既に完了しています。** `matrix-renderer.ts` の6箇所は全て `instanceof` ガードに置換済みです：

- L218, L235: `ev.target instanceof HTMLElement` ガード
- L219, L236: `closest<HTMLTableCellElement>()` ジェネリック型（`as` 不要）
- L223, L240: `target.cellIndex?.toString()` オプショナルチェイン（`as HTMLTableCellElement` 不要）
- L229, L246: `c instanceof HTMLElement` ガード

**分解不要 — タスクは完了済みです。** このissueはクローズしてください。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
