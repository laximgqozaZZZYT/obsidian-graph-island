## Description (subtask of 1463-dead-exports)

1. subtask-2 終了時点で `npx ts-prune` を再実行し、dead exports の残数を確認
  2. `src/` 直下ファイル (main.ts, types.ts, i18n.ts, settings.ts ほか) と subtask-1/2 で残った領域の dead exports を削除
  3. types.ts の場合は外部公開 API として意図的に残すべき型もあるので慎重に判断 (`*.test.ts` から import されている型は残す)
  4. 削除後 `npx ts-prune | wc -l` で総数を計測し、**50個以下**になっていることを確認
  5. 50個を超える場合は、残った dead exports のうち God Object 内の外部未使用 export を `export` 削除のみで対応 (関数本体は触らない)
  6. `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm format:check` 全グリーンを確認
  7. commit message に最終件数を明記 (例: "chore: dead exports 111 → N (target ≤50 met)")

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
