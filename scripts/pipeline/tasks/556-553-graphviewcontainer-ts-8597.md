---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 553-536-subtask
depends: none
summary: GraphViewContainer.ts が 8597 行であることを検証し、基準点を空コミットで記録
---

## Description (subtask of 553-536-subtask)

目的: CLAUDE.md GOD OBJECT Policy の Max Allowed (8597) と現行行数の一致を検証し、
  ratchet-down 基準点として空コミットで記録する。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` を実行し、行数が 8597 ちょうどであることを確認
  2. 行数が 8597 を超えていた場合は即座に失敗としてレポートする (CLAUDE.md 違反)
  3. 行数が 8597 以下であれば、CLAUDE.md の "Max Allowed" 列を現行値にratchet downする
     - 8597 のまま → 変更不要、空コミットのみ
     - 8597 未満 → CLAUDE.md の該当行を実値に更新
  4. コミットメッセージ:
     - 維持の場合: `chore: verify GraphViewContainer.ts at 8597 lines (Max Allowed baseline)`
     - ratchet downの場合: `chore: ratchet down GraphViewContainer.ts Max Allowed to <new>`
  5. `pnpm lint` と `pnpm test` を実行し既存ゲートが緑であることを確認

  変更対象ファイル:
  - 行数維持の場合: なし (空コミット `git commit --allow-empty`)
  - ratchet downの場合: CLAUDE.md のテーブル該当行のみ

  禁止事項:
  - GraphViewContainer.ts の実コード編集 (このタスクは検証専用)
  - Max Allowed を増やす方向の変更

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
