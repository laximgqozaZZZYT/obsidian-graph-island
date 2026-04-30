## Description (subtask of 1583-dead-exports)

`pnpm exec ts-prune` (または同等の検出コマンド) を `src/utils/` 配下のみで実行し、
  プロジェクト内で import されていない export を特定する。
  該当する関数・定数・型については以下の方針で対応する:
  - 完全に未使用 → export キーワードを外す、または定義ごと削除
  - テストでのみ使われる場合 → そのまま維持 (false positive として扱う)
  - 同ファイル内でのみ使う場合 → export を外して private 化
  変更後 `pnpm test` `pnpm lint` `pnpm build` がすべて通ることを確認する。
  CLAUDE.md の "Forbidden Patterns" に従い、依存関係や閾値は変更しない。
  作業対象は `src/utils/` 配下に限定し、他ディレクトリは変更しない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
