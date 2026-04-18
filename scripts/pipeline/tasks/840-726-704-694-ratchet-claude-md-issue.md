---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 726-715-subtask
depends: none
summary: 親タスク704-694の完了処理（ratchet測定・CLAUDE.md更新・issue移動を単一コミット）
---

## Description (subtask of 726-715-subtask)

親タスク 704-694 の完了クロージング操作を単一コミットで実施する。

  実施手順（この順序で、最後に1コミット）:
  1. ratchet 測定:
     - `pnpm test:coverage` を実行し、Statements/Branches/Functions/Lines の実測値を取得
     - `wc -l src/views/GraphViewContainer.ts src/views/PanelBuilder.ts src/views/EdgeRenderer.ts src/views/RenderPipeline.ts` で God Object 行数を取得
     - `ls -la main.js` でバンドルサイズ確認（800KB budget以内）
  2. CLAUDE.md 更新:
     - `## GOD OBJECT Policy` テーブルの Max Allowed 列を、測定値が下回った場合のみ引き下げ（ratchet down only）
     - Quality Gates セクションに現行 coverage 実測値を反映（閾値は下げない）
  3. issue ファイル移動:
     - `git mv issues/in-progress/715-704-subtask.md issues/done/715-704-subtask.md`
     - frontmatter の `status: decomposed` → `status: done` に更新、`completed: 2026-04-18` を追加
  4. 検証ゲート（コミット前に必須）:
     - `pnpm test` PASS
     - `pnpm lint` PASS
     - `pnpm format:check` PASS
  5. 単一コミット作成:
     - メッセージ: `chore: done 715-704-subtask (ratchet + close)`
     - 上記1-3の全変更を含める（分割禁止）

  制約:
  - God Object ファイルの行数は増やさない（Max Allowed 境界値）
  - coverage 閾値は絶対に下げない（ratchet down only）
  - 新規ファイル作成禁止（既存ファイル編集と git mv のみ）
  - `--no-verify` 等の hook バイパス禁止

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
