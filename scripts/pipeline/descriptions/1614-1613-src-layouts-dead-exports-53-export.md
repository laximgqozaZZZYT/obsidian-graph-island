## Description (subtask of 1613-dead-exports)

`tmp/dead-exports-report.md` の Category B/C 配下にある src/layouts/* の
  エントリを処理する。
  手順:
  1. `pnpm check:dead-exports` を実行して最新レポートを再生成。
  2. src/layouts/ 配下の Category B エントリ(同一モジュール内のみ使用)に
     ついては `export` キーワードのみ削除し、ファイル内の利用箇所が
     コンパイル可能であることを `pnpm tsc --noEmit` で確認。
  3. src/layouts/ 配下の Category C エントリ(完全未使用)は関数/型定義
     ごと削除。削除後の参照漏れを `pnpm lint` と `pnpm tsc --noEmit` で確認。
  4. Category A(`isExactPreset`, `pointToNearestRoad`, `applyTreeLayout`)
     は tests から利用されているため触らない。
  5. `pnpm test` がグリーンであること、`pnpm check:dead-exports` で
     src/layouts の件数が大きく減っていることを確認しコミット。
  god object の追加・行数増加禁止。CLAUDE.md の Forbidden Pattern 遵守。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
