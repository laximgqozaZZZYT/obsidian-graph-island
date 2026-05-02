## Description (subtask of 1583-dead-exports)

`src/layouts/` および `src/parsers/` 配下に対して同様の dead export 検出を行い、
  未使用 export を削除または private 化する。
  - 純粋関数として export されているがどこからも import されていないものは削除
  - 型定義が使われていない場合も削除対象
  - レイアウトアルゴリズムは "pure functions where possible" の方針なので、
    同ファイル内で使うヘルパーは export を外す
  subtask-1 の commit 後に実施。`pnpm test` `pnpm lint` `pnpm build` を通すこと。
  GraphViewContainer.ts など God Object ファイルからの参照が切れていないか
  Grep で確認すること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
