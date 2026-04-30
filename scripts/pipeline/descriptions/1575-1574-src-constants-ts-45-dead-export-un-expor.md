## Description (subtask of 1574-dead-exports)

対象 45 シンボル (ts-prune 出力に列挙) を src/constants.ts から削除する。
  該当群は VIEW_MODE_* (5) / NODE_DECO_* (11) / 描画系定数 (24) /
  PATHFINDER_* (5) で、いずれもプロジェクト内 import が存在しない。
  手順:
    1. `npx ts-prune | grep "src/constants.ts" | grep -v "used in module"`
       で対象行を再取得。
    2. 各シンボルについて `Grep` で src/ tests/ を検索し、import が
       1件もないことを確認。
    3. import がないものは const 宣言ごと削除する。
       (export だけ外す対応は ts-prune 上ノイズが残るため不可。完全削除する。)
    4. 削除後 `pnpm build` `pnpm test` が通ることを確認。
    5. RenderThresholds 経由で参照される定数は対象外なので、
       Grep で必ず "RenderThresholds" 経由の参照も確認すること。
  god object 対象外ファイルなので行数増減の制約はない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
