---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 926-902-graphviewcontainer-ts-claude-md-ratchet
depends: none
summary: GraphViewContainer.ts 行数測定→CLAUDE.md ratchet 更新→issue done 化を単一コミット
---

## Description (subtask of 926-902-graphviewcontainer-ts-claude-md-ratchet)

単一セッション・単一コミットで完結させる原子的タスク。再分解禁止。

  実行手順:
  1. `wc -l src/views/GraphViewContainer.ts` で現在行数 N を取得 (Read or Bash の wc のみ許可。src/ 編集禁止)

  2. 分岐:
     - **N > 8597 の場合 (ratchet 違反)**:
       - CLAUDE.md は変更しない
       - `issues/in-progress/727-715-graphviewcontainer-ratchet-issue-done.md` の description 末尾に
         「違反記録: 2026-04-19 実測 N=<値>行、上限 8597 超過」を追記
       - done/ へは移動しない (in-progress のまま)
       - 違反記録のみを単一コミット

     - **N <= 8597 の場合**:
       - CLAUDE.md "GOD OBJECT Policy" テーブルの `src/views/GraphViewContainer.ts` 行で、
         "Lines" 列と "Max Allowed" 列の両方を N に更新 (Edit で該当行のみピンポイント変更)
       - 対象 issue ファイルの frontmatter `status: in-progress` → `status: done` に変更
       - `git mv issues/in-progress/727-715-graphviewcontainer-ratchet-issue-done.md
         issues/done/727-715-graphviewcontainer-ratchet-issue-done.md`

  3. 単一コミット作成:
     - メッセージ: `chore: ratchet GraphViewContainer max-allowed to <N> lines`
       (違反時は `chore: record ratchet violation for GraphViewContainer (<N> > 8597)`)
     - 変更ファイル全てを 1 コミットに含める

  厳守制約:
  - `src/` `tests/` への write/edit 禁止 (測定のための Read/wc のみ許可)
  - Max Allowed を現在値 8597 より増やす変更は禁止 (ratchet down only)
  - 複数コミット禁止
  - `pnpm build` / `pnpm test` 不要 (メタデータのみ)
  - `--no-verify` / amend 禁止

  Acceptance:
  - [ ] N <= 8597 の場合: CLAUDE.md の Lines/Max Allowed が実測 N と一致
  - [ ] N <= 8597 の場合: issue ファイルが done/ に移動済み (git mv で履歴保持)
  - [ ] N > 8597 の場合: 違反記録が description に追記され、ファイルは in-progress のまま
  - [ ] 単一コミットで完結 (`git log -1` で確認)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
