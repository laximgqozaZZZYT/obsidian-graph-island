---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 715-704-subtask
depends: none
summary: GraphViewContainer ratchet + 親issue done化 + 単一コミット
---

## Description (subtask of 715-704-subtask)

前提: 704-694の検証(594-585)が完了済みであること。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` で N を取得
     - src/ 配下は一切編集しない(読み取りのみ)
  2. CLAUDE.md の GOD OBJECT Policy 表 GraphViewContainer.ts 行を判定:
     - N < 8597: Edit で 2箇所(現在行数列, Max Allowed列)を N に更新(ratchet down)
     - N >= 8597: CLAUDE.md は編集しない(増加方向は絶対禁止)
  3. `ls issues/pending/617-593-594-585-done-*.md` で対象ファイル特定
  4. Edit で frontmatter を更新:
     - status: decomposed → done
     - completed: 2026-04-18 を追加
  5. `git mv issues/pending/<file>.md issues/done/<file>.md`
  6. 単一コミット:
     - ratchet あり: "chore: done 593-585-subtask — ratchet GraphViewContainer 8597→N (verified 594-585)"
     - ratchet なし: "chore: done 593-585-subtask — verified 594-585 (lines: 8597/8597, no ratchet)"
  7. 検証:
     - `git diff HEAD~1 -- src/ tests/` が空であること
     - `git log -1 --stat` の変更ファイルが CLAUDE.md と issues/ のみ

  禁止事項:
  - src/views/GraphViewContainer.ts 本体編集
  - src/・tests/ 配下の編集
  - pnpm test/lint/build 実行
  - Max Allowed を増加方向に更新
  - 複数コミット分割

  Acceptance:
  - CLAUDE.md の行数が N と一致(ratchet適用時)、または 8597 のまま(N>=8597時)
  - 対象issueが issues/done/ に移動
  - コミット1件のみ、変更ファイルが CLAUDE.md + issues/ のみ

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
