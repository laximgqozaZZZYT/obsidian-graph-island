---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 663-660-graphviewcontainer-ts-claude-md-ratchet
depends: none
summary: GraphViewContainer.ts行数測定後 CLAUDE.md ratchet down + 617-593-594-585 issue done遷移を1コミットで実行
---

## Description (subtask of 663-660-graphviewcontainer-ts-claude-md-ratchet)

## 実行手順 (厳密に順序遵守)

  1. **行数測定**: `wc -l src/views/GraphViewContainer.ts` を実行し出力値 N を変数として保持 (コミットメッセージに埋め込むため必須)

  2. **CLAUDE.md ratchet down 判定**:
     - N < 8597 の場合のみ: Edit ツールで `CLAUDE.md` の GOD OBJECT Policy 表の `src/views/GraphViewContainer.ts` 行の Max Allowed 列 `8597` を `N` に書き換え
     - N >= 8597 の場合: CLAUDE.md に一切触れない (ratchet down only 原則)

  3. **issue ファイル特定**: `issues/pending/617-593-594-585-done-subtask-2.md` を Glob または Read で確認 (完全一致しない場合は `issues/pending/617-593-594-585*` パターンで検索)

  4. **status 書き換え**: Edit ツールで frontmatter の `status: pending` または `status: in-progress` を `status: done` に変更

  5. **git mv 実行**: `git mv issues/pending/617-593-594-585-done-subtask-2.md issues/done/617-593-594-585-done-subtask-2.md`

  6. **1コミット集約** (必須):
     ```
     git add CLAUDE.md issues/
     git commit -m "chore: done 593-585-subtask — verified 594-585 (lines: N/8597)"
     ```
     (N は実測値を埋め込む)

  ## 絶対禁止
  - `src/views/GraphViewContainer.ts` 本体編集 (GOD OBJECT Policy)
  - `src/` `tests/` 配下の一切の変更
  - Max Allowed を増加方向に更新
  - N >= 8597 での CLAUDE.md 編集
  - コミット分割 (2コミット以上は不可)

  ## 受け入れ基準
  - [ ] コミットメッセージに wc -l 実測値 N が含まれる
  - [ ] N < 8597 なら CLAUDE.md 該当行 Max Allowed が N に更新、それ以外 CLAUDE.md 差分なし
  - [ ] issue frontmatter が `status: done`
  - [ ] `git log --diff-filter=R -1` で pending → done リネーム検出可能
  - [ ] `git show HEAD --stat` で src/ と tests/ に変更なし
  - [ ] コミット数 = 1

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
