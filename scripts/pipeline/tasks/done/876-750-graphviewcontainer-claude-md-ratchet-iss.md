---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 750-727-graphviewcontainer-claude-md-ratchet-iss
depends: none
summary: GraphViewContainer行数測定→CLAUDE.md ratchet→親issue done化を単一コミット
---

## Description (subtask of 750-727-graphviewcontainer-claude-md-ratchet-iss)

前提検証:
  - `git log --oneline -20` で 704-694 検証(594-585) コミットの存在を確認。不在なら即中断。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` で N 取得 (src/・tests/ は読み取りのみ、編集禁止)
  2. CLAUDE.md の GOD OBJECT Policy 表内 GraphViewContainer.ts 行を判定:
     - N < 8597: Edit で該当行の「現在行数列」と「Max Allowed列」両方を N に更新
     - N >= 8597: CLAUDE.md は編集しない
  3. `ls issues/pending/617-593-594-585-done-*.md` で対象ファイル特定 (複数時は最新、0件なら中断)
  4. Edit で frontmatter を status: done, completed: 2026-04-18 に更新
  5. `git mv issues/pending/<file>.md issues/done/<file>.md`
  6. `git add CLAUDE.md` (ratchet適用時のみ)
  7. 単一コミット:
     - ratchet あり: "chore: done 593-585-subtask — ratchet GraphViewContainer 8597→N (verified 594-585)"
     - ratchet なし: "chore: done 593-585-subtask — verified 594-585 (lines: 8597/8597, no ratchet)"
  8. 検証: `git diff HEAD~1 -- src/ tests/` が空 / `git log -1 --stat` が CLAUDE.md + issues/ のみ

  禁止: src/views/GraphViewContainer.ts 本体編集、src/・tests/ 配下編集、pnpm test/lint/build 実行、Max Allowed 増加方向更新、複数コミット分割。

  Acceptance:
  - CLAUDE.md の GraphViewContainer.ts 行数が N と一致 (ratchet時) または 8597 のまま
  - 対象 issue が issues/done/ に移動済み (status: done, completed: 2026-04-18)
  - コミット1件のみ、変更が CLAUDE.md + issues/ に限定
  - `git diff HEAD~1 -- src/ tests/` が空

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
