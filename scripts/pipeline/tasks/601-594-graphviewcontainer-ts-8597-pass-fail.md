---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 594-585-graphviewcontainer-ts-god-object-8597
depends: none
summary: GraphViewContainer.ts の行数を計測し8597行上限と比較してPASS/FAIL判定
---

## Description (subtask of 594-585-graphviewcontainer-ts-god-object-8597)

read-only 検証タスク。ファイル編集・git操作禁止。

  実行手順:
  1. `wc -l src/views/GraphViewContainer.ts` を実行し現在の行数 N を取得
  2. CLAUDE.md GOD OBJECT Policy の上限 8597 行と N を比較
  3. ログ出力:
     - N <= 8597 の場合: `PASS: GraphViewContainer.ts: N行 (上限 8597行, 余裕 (8597-N)行)`
     - N > 8597 の場合: `FAIL: GraphViewContainer.ts: N行 — 上限 8597行を (N-8597)行 超過 (CLAUDE.md GOD OBJECT Policy 違反)`
  4. FAIL 時は次工程での分解必要性をレポートに明記
  5. 最後に `git status` を実行し clean であることを確認

  禁止事項:
  - 全ファイルの編集 (Edit/Write 一切不可)
  - git add / git commit / git push
  - CLAUDE.md の上限値書き換え

  受入条件:
  - 行数計測ログが出力されていること
  - PASS/FAIL 判定が明示されていること
  - `git status` が clean であること (ファイル変更ゼロ)

  注記: 元issue自体が単一の read-only 検証で完結するため、これ以上の分解は不要。1セッションで wc → 比較 → ログ出力 → git status 確認まで完了する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
