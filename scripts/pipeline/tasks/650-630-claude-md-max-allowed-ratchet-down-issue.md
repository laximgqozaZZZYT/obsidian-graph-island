---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 630-617-claude-md-max-allowed-ratchet-down-issue
depends: subtask-1 (617-593-594-585-done の subtask-1 で緑確認済みが前提)
summary: CLAUDE.md の Max Allowed を ratchet down 更新し、本issueを done へ遷移して単一コミット
---

## Description (subtask of 630-617-claude-md-max-allowed-ratchet-down-issue)

write-only操作のみ。以下を1コミットに集約する。

  1. 現在の `src/views/GraphViewContainer.ts` の行数を取得 (wc -l)。
     - 行数 < 8597 の場合のみ、CLAUDE.md の GOD OBJECT Policy 表で
       `src/views/GraphViewContainer.ts` の `Max Allowed` 列を現行値に更新。
     - 行数 >= 8597 の場合は CLAUDE.md を触らない (ratchet down only、増加方向は絶対禁止)。
     - "Max Allowed" = 現行行数 のルールに厳密に従う。

  2. 本プレースホルダーissueファイル (issues/pending/ 配下の該当ファイル) の frontmatter を
     `status: pending` または `status: in-progress` → `status: done` に更新。

  3. `git mv issues/pending/<filename>.md issues/done/<filename>.md` で移動。

  4. 以下の3変更 (または CLAUDE.md 無変更なら2変更) を単一コミットに集約:
     ```
     chore: done 593-585-subtask — verified 594-585 (lines: N/8597)
     ```
     N には subtask-1 で確認した実測行数を入れる。

  5. 禁止事項: `src/` 配下、`tests/` 配下、`GraphViewContainer.ts` 本体の編集は一切行わない。
     - テスト実行も不要 (subtask-1 で済んでいる前提)。
     - `pnpm build` も不要 (コード変更なし)。

  Acceptance:
  - CLAUDE.md が ratchet-down ルールに従って更新された (または同値なら無変更)
  - issueファイルが done/ へ移動し status: done
  - 単一コミットに集約されている
  - src/ tests/ 無変更 (`git diff --stat HEAD~1 HEAD` で確認可能)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
