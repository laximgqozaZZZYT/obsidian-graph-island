---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 630-617-claude-md-max-allowed-ratchet-down-issue
depends: none
summary: CLAUDE.md ratchet down + issue done遷移 + git mv + commit
---

## Description (subtask of 630-617-claude-md-max-allowed-ratchet-down-issue)

write操作のみ。subtask-1 (594-585 verify) で緑確認済みが前提。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` で現在行数 N を取得。
  2. N < 8597 の場合のみ、CLAUDE.md の GOD OBJECT Policy 表の
     `src/views/GraphViewContainer.ts` 行 Max Allowed 列を 8597 → N に更新
     (ratchet down only、N >= 8597 なら CLAUDE.md は無変更)。
  3. 本プレースホルダーissueファイル
     (`issues/pending/617-593-594-585-done-subtask-2.md` 相当) の frontmatter を
     `status: decomposed` or `status: decomposed` → `status: done` に更新。
  4. `git mv issues/pending/<file>.md issues/done/<file>.md` でファイル移動。
  5. 1コミットに集約:
     `chore: done 593-585-subtask — verified 594-585 (lines: N/8597)`

  禁止事項:
  - GraphViewContainer.ts 本体の編集禁止
  - src/配下、tests/配下の編集禁止
  - Max Allowed の増加方向更新禁止 (ratchet down only)
  - subtask-1 未完了の場合は本タスク開始禁止

  受け入れ基準:
  - [ ] N < 8597 なら CLAUDE.md 更新、N == 8597 なら CLAUDE.md 無変更
  - [ ] issue frontmatter status: done
  - [ ] git mv で pending → done 移動完了
  - [ ] 1コミットに集約、メッセージに行数 N を含む
  - [ ] src/ と tests/ に変更なし
