---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 650-630-claude-md-max-allowed-ratchet-down-issue
depends: none
summary: GraphViewContainer.ts 行数確認 → CLAUDE.md ratchet-down 更新 → issue done化を単一コミットに集約
---

## Description (subtask of 650-630-claude-md-max-allowed-ratchet-down-issue)

write-only操作のみ。src/ と tests/ は一切触らない。pnpm build / pnpm test も実行しない。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` で実測行数 N を取得。
  2. N < 8597 の場合のみ、CLAUDE.md の GOD OBJECT Policy 表の
     `src/views/GraphViewContainer.ts` 行の `Max Allowed` 列を `8597` → `N` に更新
     (Edit tool で該当行のみ置換)。
     N >= 8597 の場合は CLAUDE.md を触らない (ratchet down only)。
  3. `ls issues/pending/` で該当issueファイル名を特定し、frontmatter の
     `status: done` (または `in-progress`) を `status: done` に Edit で変更。
  4. `git mv issues/pending/<filename>.md issues/done/<filename>.md` を実行。
  5. `git add CLAUDE.md issues/` して単一コミット:
     ```
     chore: done 593-585-subtask — verified 594-585 (lines: N/8597)
     ```
     N は実測値を埋める。CLAUDE.md 無変更の場合でも同じメッセージ形式。

  検証:
  - `git diff --stat HEAD~1 HEAD` で src/ tests/ が無変更であること
  - CLAUDE.md が ratchet-down ルールに従っていること (増加方向は絶対禁止)
  - issueファイルが done/ 配下に移動し status: done になっていること
  - コミットが1つのみであること

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
