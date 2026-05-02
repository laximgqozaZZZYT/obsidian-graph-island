## Description (subtask of 1655-dead-exports)

ts-prune を再実行し、src/layouts/ 配下と src/types.ts に残っている dead exports を特定する。
  src/types.ts の interface/type は削除前に必ず全プロジェクトを grep し、
  d.ts や宣言マージで暗黙参照されていないか確認すること。
  - 内部のみで使う型 → ファイルローカルに移動 (export を外す)
  - 完全に参照されない型 → 削除
  - layouts/ 配下のヘルパー関数で未使用のもの → 削除
  CLAUDE.md の "All thresholds/magic numbers via RenderThresholds" ルールに反する
  形で定数を unexport しないこと (RenderThresholds 経由の参照は dead に見えても残す)。
  `pnpm test` `pnpm lint` `pnpm build` 全てパスを確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
