## Description (subtask of 1680-dead-exports)

1. `npx knip --reporter json` または `npx ts-prune` を実行して dead exports 一覧を取得する。
  2. 一覧を src/utils/ と src/parsers/ 配下に絞り込み、件数とシンボル名を `dead_exports_utils_parsers.txt` 等の作業メモにまとめる (コミットしない)。
  3. 各 dead export について次のいずれかを適用:
     - そのシンボルが他で全く使われていない: 関数/定数/型ごと削除する
     - 同一ファイル内で使われている: `export` キーワードを外してローカル化する
     - テストでのみ参照されている: テスト側の参照を直接アクセス可能な形に変更するか、テスト対象として残す判断をしてコメントを残す
  4. 削除/変更後 `pnpm lint` と `pnpm test` を通す。型エラー・テストエラーが出た場合は呼び出し側を修正する。
  5. もう一度 knip/ts-prune を流して、当該ディレクトリの dead exports が減っていることを確認する。
  6. CLAUDE.md の Forbidden Pattern (god object 肥大化等) に違反しないよう、変更は当該2ディレクトリ内に限定する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
