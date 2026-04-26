## Description (subtask of 1312-dead-exports)

1. `npx knip` を再実行し残存 dead exports を確認する。
  2. 50個以下になっていない場合、残存リストから type alias / interface / 定数の
     未使用 export を優先的に削除する。型については「同ファイル内で使われていれば
     export を外し、どこでも使われていなければ定義ごと削除」する。
     God Object 4ファイル (上記) はこのタスクでも触らない。
  3. 削除後 `npx knip` で件数を再測定し、50以下を確認する。50を超えていたら
     残件と理由 (例: public API として残す、obsidian plugin entry 必須) を
     コミットメッセージに列挙する。
  4. `scripts/check-dead-exports.mjs` を新規作成:
     - `npx knip --reporter json` を実行し、unused exports 件数を抽出
     - 50 を超えたら exit 1、以下なら exit 0
     - package.json の scripts に `"check:dead-exports": "node scripts/check-dead-exports.mjs"` を追加
  5. `pnpm test` / `pnpm lint` / `pnpm build` / `pnpm check:dead-exports` がすべてグリーンであることを確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
