---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 840-726-704-694-ratchet-claude-md-issue
depends: none
summary: 親タスク704-694のratchet測定・CLAUDE.md更新・issue移動を単一コミットで完了
---

## Description (subtask of 840-726-704-694-ratchet-claude-md-issue)

親タスク 704-694 のクロージング作業を、以下の順序で実施し、最後に **単一コミット** にまとめる。分割禁止。

  手順:
  1. ratchet 測定（結果を保存し、2-3で参照）
     - `pnpm test:coverage` 実行 → Statements/Branches/Functions/Lines 実測値を取得
     - `wc -l src/views/GraphViewContainer.ts src/views/PanelBuilder.ts src/views/EdgeRenderer.ts src/views/RenderPipeline.ts` で God Object 4ファイルの行数取得
     - `ls -la main.js` でバンドルサイズ確認（800KB 以内であることを確認のみ、変更不要）

  2. CLAUDE.md 更新（ratchet down only）
     - `## GOD OBJECT Policy` テーブル: 実測値が現行 Max Allowed を下回ったファイルのみ Max Allowed を実測値に引き下げる。増えた場合・同値は変更しない
     - `## Quality Gates` セクション: 現行 coverage 実測値を反映（vitest.config.ts の閾値は絶対に下げない、記述のみ更新）

  3. issue ファイル移動
     - `git mv issues/in-progress/715-704-subtask.md issues/done/715-704-subtask.md`
     - 移動後のファイルで frontmatter を編集:
       - `status: decomposed` → `status: done`
       - `completed: 2026-04-18` を追加

  4. 検証ゲート（コミット前に必須、1つでも失敗したら中止して原因調査）
     - `pnpm test` PASS
     - `pnpm lint` PASS
     - `pnpm format:check` PASS

  5. 単一コミット作成
     - `git add CLAUDE.md issues/done/715-704-subtask.md` （git mv は自動で stage される）
     - コミットメッセージ: `chore: done 715-704-subtask (ratchet + close)`
     - 手順1-3の全変更を1コミットに含める

  禁止事項:
  - God Object 4ファイルの行数を増やすコード変更
  - coverage 閾値の引き下げ（vitest.config.ts thresholds は触らない）
  - 新規ファイル作成（既存ファイル編集と git mv のみ）
  - `--no-verify` 等の hook バイパス
  - 複数コミットへの分割

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
