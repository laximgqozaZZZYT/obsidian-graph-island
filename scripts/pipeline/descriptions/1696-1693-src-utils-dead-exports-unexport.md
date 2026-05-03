## Description (subtask of 1693-dead-exports)

`pnpm exec ts-prune` (または `npx knip`) を実行して dead exports 一覧を取得する。
  src/utils/ 配下の各ファイルについて、リストに含まれる export を以下のいずれかで処理する:
  - 同ファイル内でのみ使われている場合: `export` キーワードを削除して非 export 化
  - どこからも参照されていない関数/定数/型: ファイルから完全削除
  - 既存テストが import している場合は削除しない (テストも実使用)
  作業後 `pnpm build`, `pnpm test`, `pnpm lint` を通すこと。
  GOD OBJECT (src/views/GraphViewContainer.ts 等) には触れない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
