---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 660-649-graphviewcontainer-ts-claude-md-ratchet
depends: none
summary: GraphViewContainer.ts行数測定 + CLAUDE.md ratchet down + issue done遷移 + git mv + 1コミット
---

## Description (subtask of 660-649-graphviewcontainer-ts-claude-md-ratchet)

write操作専任の単一アトミックタスク (1コミット集約必須のため分割不可)。

  実行手順:
  1. `wc -l src/views/GraphViewContainer.ts` で現在行数 N を取得 (実測値をメモ)
  2. 条件分岐:
     - N < 8597: CLAUDE.md の GOD OBJECT Policy 表 `src/views/GraphViewContainer.ts` 行の
       Max Allowed 列を `8597` → `N` に更新 (Edit ツール使用)
     - N >= 8597: CLAUDE.md 無変更 (ratchet down only 原則)
     - N == 8597 ちょうど: CLAUDE.md 無変更
  3. `issues/pending/617-593-594-585-done-subtask-2.md` を Glob で特定
     (ファイル名が完全一致しない場合は `617-593-594-585` パターンで検索)
  4. frontmatter の `status: decomposed` または `status: decomposed` → `status: done` に Edit
  5. `git mv issues/pending/<file>.md issues/done/<file>.md` 実行
  6. 1コミットに集約:
     `git commit -m "chore: done 593-585-subtask — verified 594-585 (lines: N/8597)"`
     (N は実測値を埋め込む)

  禁止事項 (絶対遵守):
  - `src/views/GraphViewContainer.ts` 本体編集禁止 (GOD OBJECT Policy)
  - `src/` 配下、`tests/` 配下の一切の編集禁止
  - Max Allowed の増加方向更新禁止
  - N >= 8597 の場合 CLAUDE.md 更新禁止
  - 複数コミット分割禁止 (1コミット必須)

  受け入れ基準:
  - [ ] コミットメッセージに wc -l 実測値 N が含まれる
  - [ ] N < 8597 なら CLAUDE.md 該当行 Max Allowed が N に更新、それ以外は CLAUDE.md 差分なし
  - [ ] issue frontmatter が `status: done`
  - [ ] `git log --diff-filter=R -1` で pending → done リネーム検出可能
  - [ ] `git show HEAD --stat` で src/ と tests/ に変更なし
  - [ ] コミット数 = 1

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
