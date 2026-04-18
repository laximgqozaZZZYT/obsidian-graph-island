---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 629-617-594-done-graphviewcontainer-ts
depends: subtask-1
summary: GraphViewContainer.ts の現行行数を測定し、Max Allowed と比較・記録
---

## Description (subtask of 629-617-594-done-graphviewcontainer-ts)

1. Bash で `wc -l src/views/GraphViewContainer.ts` を実行し行数を取得。
  2. CLAUDE.md の GOD OBJECT Policy 表の Max Allowed (8597) と比較:
     - 超過 → 本タスクを失敗として扱い done 遷移させない。失敗理由を記録。
     - 同一 (8597) → done 遷移可。数値を「unchanged 8597」として記録。
     - 減少 → done 遷移可。新しい行数を記録 (次の上位タスクで CLAUDE.md ratchet down に使用)。
  3. 測定結果と判定を本issueの Description 末尾にコメントで追記。
  GraphViewContainer.ts 本体は **絶対に編集しない** (read-only)。新規ファイル追加禁止。
  CLAUDE.md の Max Allowed 値も本タスクでは変更しない (別の上位タスクの責務)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
