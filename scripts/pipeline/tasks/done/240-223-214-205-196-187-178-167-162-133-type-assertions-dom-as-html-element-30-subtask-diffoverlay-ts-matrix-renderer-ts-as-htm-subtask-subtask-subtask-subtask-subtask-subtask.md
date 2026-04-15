---
priority: medium
reported: 2026-04-16
status: done
source: decomposed
parent: 223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask
depends: none
summary: subtask
---

## Description (subtask of 223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask)

現状を把握しました。このタスクは十分小さく、**分解不要で1タスクとして実装可能**です。理由：

- DiffOverlay.ts: 3箇所（L369, L371, L372）
- matrix-renderer.ts: 6箇所（L218, L222, L227, L234, L238, L243）
- 全て機械的な `as HTMLElement` → `instanceof` ガード置換
- 変更はローカルで独立しており、30ターン以内に十分完了可能

しかし分解を求められているので、ファイル単位で2タスクに分割します：

---

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
