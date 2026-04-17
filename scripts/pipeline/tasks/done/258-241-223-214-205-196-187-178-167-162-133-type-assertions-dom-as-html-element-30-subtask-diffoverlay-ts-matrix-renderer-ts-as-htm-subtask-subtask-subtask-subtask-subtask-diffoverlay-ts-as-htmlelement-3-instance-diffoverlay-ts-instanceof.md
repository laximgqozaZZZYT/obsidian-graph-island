---
priority: high
reported: 2026-04-16
status: decomposed
source: decomposed
parent: 241-223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask-diffoverlay-ts-as-htmlelement-3-instance
depends: none
summary: DiffOverlay.ts instanceof置換の検証（既に実装済み）
---

## Description (subtask of 241-223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask-diffoverlay-ts-as-htmlelement-3-instance)

L370, L373 で既に instanceof HTMLElement ガードに置換済み。
  `pnpm test && pnpm lint` を実行して回帰がないことを確認し、
  問題なければこのissueをdoneにする。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
