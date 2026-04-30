## Description (subtask of 1423-dead-exports)

`pnpm exec ts-prune` を実行して src/utils/ と src/parsers/ 配下の dead exports
  を一覧化する。各 dead export について以下のいずれかを実施:
  - テストからのみ参照されている純粋関数 → そのまま残す（tests/ も import 元として
    扱われる前提を確認、`ts-prune --ignore tests` で再判定）
  - どこからも import されていない関数/定数/型 → `export` を外して module-private
    化する（同ファイル内利用のみ）か、利用箇所が皆無なら関数定義ごと削除する
  - 型エイリアス/interface で外部から参照されていないもの → unexport
  作業後 `pnpm build && pnpm test && pnpm lint` で全グリーンを確認。
  GOD OBJECT (src/views/GraphViewContainer.ts 等) には触れない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
