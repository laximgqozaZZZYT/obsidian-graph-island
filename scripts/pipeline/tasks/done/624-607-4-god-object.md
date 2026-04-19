---
priority: high
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 607-595-graphviewcontainer-ts-8597
depends: none
summary: 4つのGod Object ファイルの行数を計測し上限と照合
---

## Description (subtask of 607-595-graphviewcontainer-ts-8597)

`wc -l` を以下4ファイルに対して実行し、CLAUDE.md の God Object Policy の "Max Allowed" と比較する:
    - src/views/GraphViewContainer.ts (上限 8597)
    - src/views/PanelBuilder.ts (上限 2216)
    - src/views/EdgeRenderer.ts (上限 2702)
    - src/views/RenderPipeline.ts (上限 2321)

  コマンド例:
    wc -l src/views/GraphViewContainer.ts src/views/PanelBuilder.ts src/views/EdgeRenderer.ts src/views/RenderPipeline.ts

  結果を表形式でレポートに記録する:
    | File | Current | Max Allowed | Status |
    |------|---------|-------------|--------|
    | GraphViewContainer.ts | N | 8597 | PASS/VIOLATION |
    | PanelBuilder.ts | N | 2216 | PASS/VIOLATION |
    | EdgeRenderer.ts | N | 2702 | PASS/VIOLATION |
    | RenderPipeline.ts | N | 2321 | PASS/VIOLATION |

  違反があれば該当ファイルと超過行数を特定し、issue として別途記録する (修正はこのタスクの範囲外)。
  違反がなければ現在の行数を memory または issue コメントに記録してタスク完了。
  コード変更・テスト変更は一切発生しないため、diff は空のまま完了とする。

`★ Insight ─────────────────────────────────────`
- このタスクは read-only な計測のため、CLAUDE.md の "coverage ratchet" や "bundle size budget" といった他のquality gateには影響しません
- 計測結果が上限を下回っていれば、その値で "Max Allowed" をラチェットダウンする別issueを起票できる余地があります（ただしこのサブタスクのスコープ外）
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
