## Description (subtask of 1605-dead-exports)

実装手順:
  1. `pnpm exec knip --include exports --reporter symbols` を src/views/ に絞って実行し dead export 候補一覧を取得。
  2. 候補ごとに `grep -r "<symbolName>" src/ tests/` で本当に未参照か確認（型のみ参照・テスト経由参照を除外）。
  3. 真に未参照のものを以下のいずれかで処理:
     - 関数/クラス/定数: 定義ごと削除（god object 4ファイルでも削除なら行数減で OK）
     - `export` キーワードのみ外す（同一ファイル内で利用されている場合）
  4. `pnpm build` と `pnpm test` を実行し緑であることを確認。
  5. god object 4ファイルの行数が「Max Allowed」を超えていないことを確認。
  対象外: `src/main.ts` の Obsidian Plugin API ハンドラ、`registerView` で参照されるクラス、`*.d.ts` の型公開。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
