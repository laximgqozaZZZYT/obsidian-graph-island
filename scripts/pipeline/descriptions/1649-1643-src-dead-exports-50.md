## Description (subtask of 1643-dead-exports)

サブタスク2終了時点で `pnpm dlx ts-prune` を実行し、まだ残っている dead exports を
  src/types.ts, src/main.ts, src/settings.ts, src/i18n.ts などから1件ずつ精査する。
  - types.ts の未使用 interface/type は削除
  - settings.ts の未使用 export 定数/関数は内部化 or 削除
  - i18n.ts の未使用キーは削除 (UIから参照がないか grep で確認)
  最後に `pnpm dlx ts-prune | wc -l` を実行し件数を記録する。
  受入条件: ts-prune の dead exports 件数 ≤ 50 (PR本文に実測値記載)。
  pnpm test 全PASS、pnpm lint クリーン、pnpm build 成功、main.js サイズ < 800KB を確認。
  カバレッジしきい値は維持 (削除でカバレッジ % が変動するが閾値割れ厳禁)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
