---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 727-715-graphviewcontainer-ratchet-issue-done
depends: none
summary: GraphViewContainer 行数測定 + CLAUDE.md ratchet + 親issue done化を単一コミットで実施
---

## Description (subtask of 727-715-graphviewcontainer-ratchet-issue-done)

前提検証:
  - `git log --oneline -20` で 704-694 検証(594-585) コミットの存在を確認
  - 不在なら即中断(このタスクは実行しない)

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` で N 取得
     - src/・tests/ 配下は読み取りのみ。一切編集禁止
  2. CLAUDE.md の GOD OBJECT Policy 表内 GraphViewContainer.ts 行を判定:
     - N < 8597: Edit ツールで該当行の「現在行数列」と「Max Allowed列」両方を N に更新(ratchet down)
     - N >= 8597: CLAUDE.md は編集しない(増加方向は絶対禁止)
  3. `ls issues/pending/617-593-594-585-done-*.md` で対象ファイル特定(複数該当時は最新タイムスタンプを採用、0件なら中断)
  4. Edit で対象 issue frontmatter を更新:
     - status: decomposed → done
     - completed: 2026-04-18 を追加
  5. `git mv issues/pending/<file>.md issues/done/<file>.md`
  6. `git add CLAUDE.md` (ratchet適用時のみ)
  7. 単一コミット作成:
     - ratchet あり: "chore: done 593-585-subtask — ratchet GraphViewContainer 8597→N (verified 594-585)"
     - ratchet なし: "chore: done 593-585-subtask — verified 594-585 (lines: 8597/8597, no ratchet)"
  8. 検証:
     - `git diff HEAD~1 -- src/ tests/` が空であること(空でなければ即 revert)
     - `git log -1 --stat` の変更ファイルが CLAUDE.md と issues/ 配下のみであること

  禁止事項:
  - src/views/GraphViewContainer.ts 本体編集
  - src/・tests/ 配下の任意のファイル編集
  - pnpm test / pnpm lint / pnpm build の実行(このタスクは bookkeeping のみ)
  - Max Allowed を増加方向に更新
  - 複数コミット分割(必ず単一コミット)

  Acceptance:
  - CLAUDE.md の GraphViewContainer.ts 行数が N と一致(ratchet適用時)、または 8597 のまま(N>=8597時)
  - 対象 issue が issues/done/ に移動済み(status: done, completed: 2026-04-18)
  - コミット1件のみ、変更ファイルが CLAUDE.md + issues/ のみ
  - `git diff HEAD~1 -- src/ tests/` が空

★ Insight ─────────────────────────────────────
このプロジェクトの「GOD OBJECT ratchet」パターンは継続的改善の典型例で、行数を「最大値」として固定し、減らす方向の更新のみ許可する仕組みです。CLAUDE.md の表が単一の真実源 (single source of truth) として機能し、自律パイプラインがこの境界値を守ることで neglect による肥大化を防ぎます。
今回のタスクが `src/`・`tests/` を一切触らず CLAUDE.md と issues/ のみで完結する設計は、「検証フェーズ (594-585) で実装変更済み」「done化フェーズは bookkeeping のみ」という関心の分離を体現しており、ロールバックや監査が容易になります。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
