## Description (subtask of 1485-dead-exports)

`pnpm exec knip --reporter json` または `pnpm exec ts-prune` を実行して
  現状の未使用 export 一覧を取得する (CLAUDE.md に記載のツールがなければ
  まず devDependencies に追加せず、`pnpm dlx knip` で実行)。
  検出結果を分類:
    A. テストファイルからのみ参照される export (削除すると test 落ちる)
    B. 完全未使用 export (削除可能)
    C. 型のみ export で外部利用想定の API (保留)
  この SUBTASK では A 群を「export を外して同ファイル内 named import で
  テストへ公開」もしくは「@internal JSDoc を付与しつつ export 維持」
  どちらかに統一する。テストが require/import している場合はテストの
  import パスをそのまま維持できる方針 (export 維持 + JSDoc) を選ぶこと。
  ただし、A 群の中でテストからも参照されていない関数/定数は削除する。
  目標: 111 → 80 程度まで削減。
  完了条件: `pnpm test` と `pnpm build` が PASS、`pnpm exec knip` の
  unused export 件数を README/コメントに記載せず、コミットメッセージに
  「dead exports: 111 → N」と書く。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
