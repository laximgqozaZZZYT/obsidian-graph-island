## Description (subtask of 1564-dead-exports)

実装手順:
  1. `pnpm dlx ts-prune --project tsconfig.json` を実行し dead exports 一覧を取得
     (または `npx knip` を使用)。出力を一時的に標準出力で確認するのみ
     (ファイル化はしない、メタファイル禁止)。
  2. src/utils/ 配下と src/parsers/ 配下に該当する dead export について:
     - 他ファイルで未使用かつテストファイルでも未使用な export → `export` キーワードを削除
       (関数/定数自体は残す。ただしファイル内でも未使用なら関数自体を削除)
     - ts-prune が `(used in module)` と表示するもの → ファイル内でのみ使用 → export 削除
     - テスト (`tests/` 配下) からのみ import されているものは export 維持 (テスト用 public API)
  3. `pnpm build` で型エラーがないことを確認
  4. `pnpm test` で全テスト PASS を確認
  5. `pnpm lint` で lint エラーなしを確認
  対象範囲: src/utils と src/parsers のみ。views/layouts は

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
