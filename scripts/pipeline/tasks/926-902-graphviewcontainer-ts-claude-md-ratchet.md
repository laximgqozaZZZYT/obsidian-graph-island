---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 902-895-graphviewcontainer-ts-claude-md-ratchet
depends: none
summary: GraphViewContainer.ts行数測定→CLAUDE.md ratchet更新→727-715 issue done化を単一コミット
---

## Description (subtask of 902-895-graphviewcontainer-ts-claude-md-ratchet)

元issueの「再分解禁止」制約に従い、単一セッション・単一コミットで完結させる。
タスクファイルは `scripts/pipeline/tasks/` にフラット配置され、`in-progress/` や `done/` サブディレクトリは存在しない。状態遷移は frontmatter の `status` フィールドのみで行う（`git mv` は使用しない）。

実行手順:
1. `wc -l src/views/GraphViewContainer.ts` で現在行数 N を測定
2. 分岐判定:
   - **N > 8597（ratchet 違反）の場合**:
     - CLAUDE.md は変更しない
     - `scripts/pipeline/tasks/727-715-graphviewcontainer-ratchet-issue-done.md` の
       description に「実測 N 行、上限 8597 超過」の違反記録を追記
     - 対象 issue の `status` は `decomposed` のまま据え置き
     - 終了（コミットは違反記録のみ）
   - **N <= 8597 の場合**:
     - CLAUDE.md の "GOD OBJECT Policy" テーブルで
       `src/views/GraphViewContainer.ts` 行の "Lines" 列と "Max Allowed" 列の
       両方を N に更新（Edit ツールで該当行のみピンポイント変更）
     - `scripts/pipeline/tasks/727-715-graphviewcontainer-ratchet-issue-done.md` の
       frontmatter `status: decomposed` → `status: done` に変更（Edit のみ、`git mv` 不要）
3. 単一コミット作成:
   - メッセージ: `chore: ratchet GraphViewContainer max-allowed to <N> lines`
   - 手順2で変更した全ファイルを1コミットに含める

厳守制約:
- `src/` `tests/` には一切 touch 禁止（測定の Read/wc のみ許可）
- Max Allowed を現在値(8597)より増やす変更は禁止（ratchet down only）
- 複数コミット禁止
- `pnpm build` `pnpm test` は不要（メタデータのみ）

## Acceptance criteria

- [ ] `N <= 8597` の場合: CLAUDE.md の Lines/Max Allowed が実測 N と一致
- [ ] `N <= 8597` の場合: 727-715 の frontmatter が `status: done` に更新済み
- [ ] `N > 8597` の場合: 727-715 の description に違反記録が追記され、`status` は `decomposed` のまま
- [ ] 単一コミットで完結し、`src/` `tests/` に差分がない
