## Description (subtask of 1661-dead-exports)

まず `npx ts-prune --project tsconfig.json` (または既存の dead-export 検出スクリプト) を実行し、
  src/views/ 配下に属する dead exports をファイル別に列挙する。
  各 dead export について以下の基準で対応する:
  - そのファイル内でも使われていない関数/型/定数 → 定義ごと削除する
  - 同一ファイル内でのみ使われている関数/型/定数 → `export` キーワードのみ外す
  - テストからのみ参照されている場合 → そのテストも実態を維持しているか確認し、不要なら export 解除
  対象は src/views/ 直下と src/views/export/, src/views/render/ サブディレクトリ。
  CLAUDE.md の GOD OBJECT 行数制限を超過しないこと(削除方向なので問題なし)。
  作業後 `pnpm build` `pnpm lint` `pnpm test` が緑であることを確認する。
  完了条件: src/views/ 配下の dead exports 件数を測定して PR description に before/after を記載。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
