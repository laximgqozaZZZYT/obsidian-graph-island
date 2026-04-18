---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 771-760-
depends: none
summary: 分類結果 (target_file / unexpected_changes / warnings) を JSON 風構造化形式へ整形
---

## Description (subtask of 771-760-)

上流 (親タスク 760-730 の subtask-2) の分類結果を次の構造で stdout に出力する。
コード変更や git 操作は行わず、整形出力のみを責務とする。

出力スキーマ:
- `status`: "ok" | "warning"
- `target_file`: `<path>`
- `target_mark`: "M" | "missing"
- `unexpected_changes`: [`<path>`, ...]
- `warnings`: [`<message>`, ...]

## Acceptance criteria
- [ ] 上記スキーマに沿った構造化出力を stdout に書き出している
- [ ] git mv / git add / git commit を実行していない (safety gate)
- [ ] CLAUDE.md の Forbidden Patterns に違反しない
