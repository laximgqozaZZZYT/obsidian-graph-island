## Description (subtask of 1438-dead-exports)

`pnpm exec ts-prune` を実行して `src/utils/` 配下の dead exports を抽出する。
  各 export について以下の手順で処理:
  1. `grep -r "import.*<name>" src/ tests/` で参照を確認
  2. プロジェクト内から1件もimportされていなければ `export` キーワードを削除
     (ローカル使用が残っていればそのまま、ローカル使用もなければ関数/定数ごと削除)
  3. テストでのみ参照されている場合は `export` を維持
  作業後 `pnpm test` と `pnpm build` を通すこと。
  CLAUDE.md の Forbidden Patterns に従い、coverage しきい値は変更しない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
