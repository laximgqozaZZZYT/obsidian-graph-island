---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 902-895-graphviewcontainer-ts-claude-md-ratchet
depends: none
summary: GraphViewContainer.ts行数測定→CLAUDE.md ratchet更新→issue done化を単一コミット
---

## Description (subtask of 902-895-graphviewcontainer-ts-claude-md-ratchet)

元issueの「再分解禁止」制約に従い、単一セッション・単一コミットで完結させる。

  実行手順:
  1. `wc -l src/views/GraphViewContainer.ts` で現在行数 N を測定
  2. 分岐判定:
     - N > 8597 の場合（ratchet 違反）:
       - CLAUDE.md は変更しない
       - `issues/in-progress/727-715-graphviewcontainer-ratchet-issue-done.md` の
         description に「実測N行、上限8597超過」の違反記録を追記
       - done/ には移動しない（in-progress のまま）
       - 終了（コミットは違反記録のみ）
     - N <= 8597 の場合:
       - CLAUDE.md の "GOD OBJECT Policy" テーブルで
         `src/views/GraphViewContainer.ts` 行の "Lines" 列と "Max Allowed" 列の
         両方を N に更新（Edit toolで該当行のみピンポイント変更）
       - 対象issueファイルの frontmatter `status: in-progress` → `status: done` に変更
       - `git mv issues/in-progress/727-715-graphviewcontainer-ratchet-issue-done.md
         issues/done/727-715-graphviewcontainer-ratchet-issue-done.md` で移動
  3. 単一コミット作成:
     - メッセージ: `chore: ratchet GraphViewContainer max-allowed to <N> lines`
     - 手順2-3で変更した全ファイルを1コミットに含める

  厳守制約:
  - src/ tests/ には一切 touch 禁止（測定の Read/wc のみ許可）
  - Max Allowed を現在値(8597)より増やす変更は禁止（ratchet down only）
  - 複数コミット禁止
  - `pnpm build` `pnpm test` は不要（メタデータのみ）

  Acceptance:
  - [ ] CLAUDE.md の Lines/Max Allowed が実測 N と一致（N <= 8597 の場合）
  - [ ] issue ファイルが done/ に移動済み（N <= 8597 の場合）
  - [ ] N > 8597 の場合: 違反記録が description に追記され、ファイルは in-progress のまま
  - [ ] 単一コミットで完結

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
