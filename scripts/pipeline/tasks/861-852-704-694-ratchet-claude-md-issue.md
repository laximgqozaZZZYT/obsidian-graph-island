---
priority: medium
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 852-840-704-694-ratchet-claude-md-issue
depends: none
summary: 親704-694のratchet測定・CLAUDE.md更新・issue移動を単一コミットで実施
---

## Description (subtask of 852-840-704-694-ratchet-claude-md-issue)

親タスク704-694のクロージング作業を1コミットで完了する。分割禁止。

  手順（順序厳守）:
  1. ratchet測定
     - `pnpm test:coverage` 実行 → Statements/Branches/Functions/Lines の実測値を記録
     - `wc -l src/views/GraphViewContainer.ts src/views/PanelBuilder.ts src/views/EdgeRenderer.ts src/views/RenderPipeline.ts` で4ファイル行数取得
     - `ls -la main.js` でバンドルサイズが800KB以内であることを確認のみ

  2. CLAUDE.md更新（ratchet down only）
     - GOD OBJECT Policy表: 実測値 < 現行Max Allowed のファイルのみMax Allowedを実測値に引き下げ。増加・同値は変更しない
     - Quality Gates節: 現行coverage実測値の記述を更新（vitest.config.tsの閾値は触らない）

  3. issueファイル移動
     - `git mv issues/in-progress/715-704-subtask.md issues/done/715-704-subtask.md`
     - 移動後ファイルのfrontmatter編集: `status: in-progress` → `status: done`、`completed: 2026-04-19` 追加（今日の日付）

  4. 検証ゲート（1つでも失敗なら中止）
     - `pnpm test` PASS
     - `pnpm lint` PASS
     - `pnpm format:check` PASS

  5. 単一コミット作成
     - `git add CLAUDE.md` （git mv分は自動stage済み）
     - コミットメッセージ: `chore: done 715-704-subtask (ratchet + close)`

  禁止事項:
  - God Object 4ファイルへのコード変更
  - vitest.config.ts thresholds の引き下げ
  - 新規ファイル作成（既存編集とgit mvのみ）
  - `--no-verify` によるhookバイパス
  - 複数コミットへの分割

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
