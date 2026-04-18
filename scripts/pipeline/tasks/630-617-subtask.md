---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 617-593-594-585-done
depends: none
summary: subtask
---

## Description (subtask of 617-593-594-585-done)

で取得した GraphViewContainer.ts の行数が 8597 未満の場合のみ、
  CLAUDE.md の GOD OBJECT Policy 表で以下を更新:
  - `| `src/views/GraphViewContainer.ts` | 8597 | 8597 | ... |`
    の 2列目 (Lines) と 3列目 (Max Allowed) を現行行数に書き換え。
  行数が変わっていない場合はこのサブタスクをスキップ (編集なし)。
  Edit tool で該当行のみピンポイント変更。他の god object 行は触らない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
