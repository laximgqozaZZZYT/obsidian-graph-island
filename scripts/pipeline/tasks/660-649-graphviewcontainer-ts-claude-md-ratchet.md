---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 649-630-claude-md-ratchet-down-issue-done-git-mv
depends: 594-585-subtask-1 (verify緑確認済み前提)
summary: GraphViewContainer.ts の行数を測定し CLAUDE.md ratchet down + issue done遷移 + git mv + 1コミット
---

## Description (subtask of 649-630-claude-md-ratchet-down-issue-done-git-mv)

write操作専任タスク。subtask-1 (594-585 verify) 完了が前提。

  実行手順:
  1. `wc -l src/views/GraphViewContainer.ts` で現在行数 N を取得してメモ。
  2. **条件分岐**:
     - N < 8597 の場合: CLAUDE.md の GOD OBJECT Policy 表の
       `src/views/GraphViewContainer.ts` 行の Max Allowed 列を `8597` → `N` に更新。
     - N >= 8597 の場合: CLAUDE.md は無変更 (ratchet down only 原則)。
  3. `issues/pending/617-593-594-585-done-subtask-2.md` を検索・特定し、
     frontmatter の `status: decomposed` または `status: decomposed` → `status: done` に更新。
  4. `git mv issues/pending/<file>.md issues/done/<file>.md` でファイル移動。
  5. 1コミットに集約してコミット:
     メッセージ: `chore: done 593-585-subtask — verified 594-585 (lines: N/8597)`
     (N は実測値を埋め込む)

  禁止事項:
  - `src/views/GraphViewContainer.ts` 本体の編集禁止 (GOD OBJECT Policy)
  - `src/` 配下、`tests/` 配下の一切の編集禁止
  - Max Allowed の増加方向更新禁止 (ratchet down only)
  - N == 8597 ちょうどの場合も CLAUDE.md 更新禁止 (N < 8597 のみ更新)
  - 複数コミットへの分割禁止 (1コミット集約必須)
  - subtask-1 (594-585 verify) 未完了状態での開始禁止

  受け入れ基準:
  - [ ] `wc -l` の実測値 N がコミットメッセージに含まれる
  - [ ] N < 8597 なら CLAUDE.md の該当行 Max Allowed が N に更新、N >= 8597 なら CLAUDE.md 差分なし
  - [ ] issue frontmatter が `status: done` に更新済み
  - [ ] `git log --diff-filter=R` で pending → done のリネーム検出可能
  - [ ] `git show HEAD --stat` で src/ と tests/ に変更が一切ないこと
  - [ ] コミット数 = 1 (追加コミット禁止)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
