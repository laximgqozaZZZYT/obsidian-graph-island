---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 601-594-graphviewcontainer-ts-8597-pass-fail
depends: none
summary: GraphViewContainer.ts の行数を計測し8597行上限と比較してPASS/FAIL判定
---

## Description (subtask of 601-594-graphviewcontainer-ts-8597-pass-fail)

read-only 検証タスク。ファイル編集・git操作は一切禁止。

実行手順:
1. `wc -l src/views/GraphViewContainer.ts` を実行し現在の行数 N を取得
2. CLAUDE.md GOD OBJECT Policy の上限 8597 行と N を比較
3. ログ出力:
   - N <= 8597 の場合: `PASS: GraphViewContainer.ts: N行 (上限 8597行, 余裕 (8597-N)行)`
   - N > 8597 の場合: `FAIL: GraphViewContainer.ts: N行 — 上限 8597行を (N-8597)行 超過 (CLAUDE.md GOD OBJECT Policy 違反)`
4. FAIL 時は次工程での分解必要性をレポートに明記 (親issue 594-585 へのフィードバック)
5. 最後に `git status` を実行し clean であることを確認

禁止事項:
- 全ファイルの編集 (Edit/Write 一切不可)
- git add / git commit / git push
- CLAUDE.md の上限値書き換え
- 親issue の GOD OBJECT Policy 上限 "Max Allowed" 値の改変

## Acceptance criteria
- [ ] `wc -l src/views/GraphViewContainer.ts` の行数計測ログが出力されている
- [ ] 上限 8597 行との比較で PASS / FAIL 判定が明示されている
- [ ] FAIL 時は親issue 594-585 へのフィードバックとして超過行数を記録
- [ ] `git status` が clean (ファイル変更ゼロ) で終了している
