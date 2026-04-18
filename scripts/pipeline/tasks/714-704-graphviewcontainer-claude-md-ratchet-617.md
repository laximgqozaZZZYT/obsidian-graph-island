---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 704-694-graphviewcontainer-claude-md-ratchet-dow
depends: none
summary: GraphViewContainer行数再確認→CLAUDE.md ratchet→617-593-594-585 issue done遷移を1コミット
---

## Description (subtask of 704-694-graphviewcontainer-claude-md-ratchet-dow)

前提検証:
  - `git log --oneline -20` で親issue 617-593-594-585 の subtask-1 完了コミット (pnpm test/lint/format:check 緑) を確認
  - 確認できなければ exit 1 で中断 (本タスク実行禁止)

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` で N を取得 (read-only)
  2. CLAUDE.md の GOD OBJECT Policy 表 GraphViewContainer.ts 行を確認:
     - N < 8597 → "8597" を N に置換 (現在行数とMax Allowed両方、ratchet down only)
     - N >= 8597 → CLAUDE.md は無変更 (増加方向更新は絶対禁止)
  3. `ls issues/pending/617-593-594-585-done-*.md` で対象ファイル特定
  4. 対象 issue ファイルの frontmatter を Edit:
     - status: decomposed → done
     - completed: 2026-04-18 を追加
  5. `git mv issues/pending/<file>.md issues/done/<file>.md`
  6. 単一コミット作成 (Co-Authored-By 含む):
     - ratchet あり: "chore: done 593-585-subtask — ratchet GraphViewContainer 8597→N (verified 594-585)"
     - ratchet なし: "chore: done 593-585-subtask — verified 594-585 (lines: 8597/8597, no ratchet)"

  検証 (コミット後):
  - `git diff HEAD~1 -- src/ tests/` が空 (空でなければ即座に reset)
  - `git log -1 --stat` で変更ファイルが CLAUDE.md と issues/ のみ

  禁止事項:
  - src/views/GraphViewContainer.ts 本体の編集
  - src/ 配下、tests/ 配下の一切の編集
  - pnpm test / pnpm lint / pnpm build の実行
  - Max Allowed の増加方向更新
  - 複数コミット分割

  Acceptance:
  - [ ] CLAUDE.md の GOD OBJECT Policy 表が現行行数と整合 (または同値で無変更)
  - [ ] issueファイルが issues/done/ 配下に移動済み
  - [ ] 変更が1コミットに集約
  - [ ] git diff HEAD~1 -- src/ tests/ が空

`★ Insight ─────────────────────────────────────`
- このissueの本質は「観測 (wc -l) → 条件分岐 (ratchet/no-op) → 状態遷移 (status, ファイル移動)」の3ステップで、claude -p の30ターン制限内に余裕で収まります。
- 検証フリー設計 (test/lint/build skip) は親issueでの品質保証を信頼することで、CIコストとレイテンシを削減する自律パイプライン特有の最適化パターンです。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
