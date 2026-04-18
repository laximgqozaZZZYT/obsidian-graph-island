---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 667-663-subtask
depends: none
summary: GraphViewContainer.ts 行数測定とCLAUDE.md ratchet down + status遷移を1コミットで実行
---

## Description (subtask of 667-663-subtask)

以下を厳密に1コミットで実行する不可分タスク:

  1. `wc -l src/views/GraphViewContainer.ts` で現在の行数を測定
  2. CLAUDE.md の GOD OBJECT Policy テーブルの `src/views/GraphViewContainer.ts` 行を確認:
     - 現在値 8597 > 測定値 の場合のみ、Lines列と Max Allowed列を測定値に更新(ratchet down)
     - 測定値 >= 8597 の場合は CLAUDE.md を変更せず、このタスクは「変更なし」としてクローズ
  3. issue ファイルを `.claude/issues/in-progress/663-660-*.md` → `.claude/issues/done/663-660-*.md` へ `git mv` で移動
  4. issue の status フィールドを `in-progress` → `done` に更新
  5. 上記すべてを1コミットにまとめる:
     ```
     git add -A
     git commit -m "chore: ratchet down GraphViewContainer.ts max-allowed to <N> lines"
     ```

  重要制約:
  - pnpm build / pnpm test は実行しない(行数測定のみなので不要、コード変更なし)
  - GraphViewContainer.ts 本体には一切触れない(測定のみ)
  - ratchet down のみ、増加(ratchet up)は絶対禁止
  - 分割コミット禁止(原子性維持)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
