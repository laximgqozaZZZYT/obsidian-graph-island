---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 694-650-graphviewcontainer-ts-claude-md-ratchet
depends: none
summary: GraphViewContainer行数再確認→CLAUDE.md ratchet-down→issue done遷移を1コミット
---

## Description (subtask of 694-650-graphviewcontainer-ts-claude-md-ratchet)

前提検証:
  - 親issue 617-593-594-585-done の subtask-1 で pnpm test/lint/format:check が緑であることを git log / issue 状態から確認
  - 未検証なら本タスクを実行せず失敗終了 (exit 1)

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` で N を取得 (read-only, 本体編集禁止)
  2. CLAUDE.md の GOD OBJECT Policy 表 GraphViewContainer.ts 行を確認:
     - N < 8597 → 現在行数とMax Allowedの両方を N に更新 (ratchet down only)
     - N >= 8597 → CLAUDE.md は一切変更しない (増加方向更新は絶対禁止)
  3. `ls issues/pending/617-593-594-585-done-*.md` で対象ファイル特定
  4. 対象 issue ファイルの frontmatter を編集:
     - status: decomposed → done
     - completed: 2026-04-18 を追加
  5. `git mv issues/pending/<file>.md issues/done/<file>.md`
  6. 単一コミット作成:
     - ratchet あり: "chore: done 593-585-subtask — ratchet GraphViewContainer 8597→N (verified 594-585)"
     - ratchet なし: "chore: done 593-585-subtask — verified 594-585 (lines: 8597/8597, no ratchet)"

  検証:
  - `git diff HEAD~1 -- src/ tests/` が空であること
  - `git log -1 --stat` で変更ファイルが CLAUDE.md と issues/ のみであること

  禁止事項:
  - src/views/GraphViewContainer.ts 本体の編集
  - src/ 配下、tests/ 配下の一切の編集
  - pnpm test / pnpm lint / pnpm build の実行 (subtask-1 で検証済み前提)
  - Max Allowed の増加方向更新
  - 複数コミット分割

  Acceptance:
  - [ ] CLAUDE.md の GOD OBJECT Policy 表が現行行数と整合 (または同値で無変更)
  - [ ] issueファイルが issues/done/ 配下に移動済み
  - [ ] 変更が1コミットに集約
  - [ ] git diff HEAD~1 -- src/ tests/ が空

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
