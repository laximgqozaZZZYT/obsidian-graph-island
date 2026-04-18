---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 650-630-claude-md-ratchet-down-issue-done-1
depends: none
summary: GraphViewContainer.ts行数再確認 → CLAUDE.md ratchet-down → issue done遷移を1コミット
---

## Description (subtask of 650-630-claude-md-ratchet-down-issue-done-1)

前提検証:
  - 親issue 617-593-594-585-done の subtask-1 で pnpm test/lint/format:check が緑であること
  - 未検証なら本タスクを実行せず失敗終了

  手順:
  1. wc -l src/views/GraphViewContainer.ts で N を取得 (read-only)
  2. CLAUDE.md の GOD OBJECT Policy 表の GraphViewContainer.ts 行を確認:
     - N < 8597 → 現在行数とMax Allowedの両方を N に更新 (ratchet down only)
     - N >= 8597 → CLAUDE.md は一切変更しない (増加方向更新は絶対禁止)
  3. issues/pending/617-593-594-585-done-*.md の frontmatter:
     - status: in-progress → done
     - completed: 2026-04-18 を追加
  4. git mv issues/pending/<file>.md issues/done/<file>.md
  5. 単一コミット:
     - ratchet あり: "chore: done 593-585-subtask — ratchet GraphViewContainer 8597→N (verified 594-585)"
     - ratchet なし: "chore: done 593-585-subtask — verified 594-585 (lines: 8597/8597, no ratchet)"

  禁止:
  - src/views/GraphViewContainer.ts 本体の編集
  - src/ 配下、tests/ 配下の一切の編集
  - pnpm test / pnpm lint の再実行
  - Max Allowed の増加方向更新
  - 複数コミット分割

  Acceptance:
  - [ ] CLAUDE.md の GOD OBJECT Policy 表が現行行数と整合 (または同値で無変更)
  - [ ] issueファイルが issues/done/ 配下に移動済み
  - [ ] 変更が1コミットに集約
  - [ ] git diff HEAD~1 -- src/ tests/ が空
```

`★ Insight ─────────────────────────────────────`
- 分解禁止の判断基準: 「1コミット集約」「単一の論理操作」「全工程が30ターン以内で完結」のいずれかが該当すれば原則として分解しない
- このタスクの本質は「subtask-1 の検証結果を CLAUDE.md と issue 状態に反映する transactional 操作」であり、途中で分割するとリポジトリ状態が不整合になるリスク
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
