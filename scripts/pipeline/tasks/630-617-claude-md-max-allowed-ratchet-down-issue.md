---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 617-593-594-585-done
depends: subtask-1
summary: CLAUDE.md のMax Allowedをratchet down更新し、本issueをdoneに遷移してコミット
---

## Description (subtask of 617-593-594-585-done)

write操作のみ。subtask-1ですべて緑確認済みが前提。
  1. subtask-1で取得した GraphViewContainer.ts の現在行数が 8597 より小さい場合のみ、
     CLAUDE.md の GOD OBJECT Policy 表の該当行 Max Allowed を現行値に更新
     (ratchet down only、増加方向には絶対更新しない)。同値なら CLAUDE.md は無変更。
  2. 本プレースホルダーissueファイルの frontmatter を
     `status: decomposed` or `status: decomposed` → `status: done` に更新。
  3. issueファイルを `issues/pending/` から `issues/done/` へ `git mv` で移動。
  4. 変更を1コミットに集約(メッセージ例: `chore: done 593-585-subtask — verified 594-585 (lines: N/8597)`)。
  GraphViewContainer.ts本体、src/配下、tests/配下は一切編集禁止。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
