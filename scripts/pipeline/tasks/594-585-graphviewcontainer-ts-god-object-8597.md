---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 585-575-graphviewcontainer-ts-god-object
depends: none
summary: GraphViewContainer.ts の行数を計測しGod Object上限8597行以内を検証
---

## Description (subtask of 585-575-graphviewcontainer-ts-god-object)

read-only 検証タスク。ファイル変更・コミット禁止。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` を実行し、現在の行数を取得
  2. CLAUDE.md の GOD OBJECT Policy 記載の上限 8597 行と比較
  3. 以下のいずれかをログ出力:
     - PASS: `GraphViewContainer.ts: <N>行 (上限 8597行, 余裕 <8597-N>行)`
     - FAIL: `GraphViewContainer.ts: <N>行 — 上限 8597行を <N-8597>行 超過 (CLAUDE.md GOD OBJECT Policy 違反)`
  4. FAIL の場合、次工程で分解が必要である旨を報告に含める

  禁止事項:
  - src/views/GraphViewContainer.ts を含む全ファイルの編集
  - git add / git commit / git push
  - CLAUDE.md 上限値の書き換え (ratchet down のみ許可、本タスクでは触らない)

## Acceptance criteria
- [ ] `wc -l src/views/GraphViewContainer.ts` の結果がログ出力されている
- [ ] 上限 8597 行との比較結果 (PASS/FAIL) が明示されている
- [ ] `git status` が clean (ファイル変更・コミットなし)
- [ ] CLAUDE.md のルールに違反しないこと
