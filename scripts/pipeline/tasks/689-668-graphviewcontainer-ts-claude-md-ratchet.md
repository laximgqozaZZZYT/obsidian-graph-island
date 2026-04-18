---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 668-663-graphviewcontainer-ts-claude-md-ratchet
depends: none
summary: GraphViewContainer.ts 行数測定 → CLAUDE.md ratchet down → issue done 遷移を1コミットで実行
---

## Description (subtask of 668-663-graphviewcontainer-ts-claude-md-ratchet)

## 手順 (厳密順序)
  1. `wc -l src/views/GraphViewContainer.ts` で行数 N を取得し、後続コミットメッセージに埋め込む
  2. N < 8597 のときだけ Edit ツールで CLAUDE.md GOD OBJECT Policy 表の `src/views/GraphViewContainer.ts` 行の Max Allowed 列 `8597` を `N` に書き換え。N >= 8597 なら CLAUDE.md 無変更
  3. `issues/pending/617-593-594-585-done-subtask-2.md` を Read で確認 (見つからない場合は Glob `issues/pending/617-593-594-585*`)
  4. Edit で frontmatter の `status:` を `done` に変更
  5. `git mv issues/pending/617-593-594-585-done-subtask-2.md issues/done/617-593-594-585-done-subtask-2.md`
  6. 1コミット集約:
     ```
     git add CLAUDE.md issues/
     git commit -m "chore: done 593-585-subtask — verified 594-585 (lines: N/8597)"
     ```
     (N は実測値)

  ## 絶対禁止
  - src/views/GraphViewContainer.ts 本体の編集
  - src/ tests/ 配下の一切の変更
  - Max Allowed の増加方向更新
  - N >= 8597 での CLAUDE.md 編集
  - 2コミット以上への分割

  ## 受け入れ基準
  - コミットメッセージに wc -l 実測値 N が含まれる
  - N < 8597 なら CLAUDE.md 該当行のみ更新、それ以外 CLAUDE.md 差分なし
  - issue frontmatter が `status: done`
  - `git log --diff-filter=R -1` で pending → done リネーム検出可能
  - `git show HEAD --stat` で src/ tests/ に変更なし
  - コミット数 = 1

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
