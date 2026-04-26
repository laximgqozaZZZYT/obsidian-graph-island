## Description (subtask of 1350-dead-exports)

src/views/EdgeRenderer.ts の以下11個の dead な exported type を `export` キーワード除去 (内部 type に降格) する。プロジェクト内のどこからも import されていないことが確認済み。

  対象 type:
    - GroupPort
    - Trunk
    - TrunkCable
    - NodePort
    - IntraGroupCable
    - CableRouteOpts
    - GroupPerimInfo
    - PolarJunctionGrid
    - PortLaneInfo
    - PortColorLanes
    - CablePrepResult

  手順:
  1. `src/views/EdgeRenderer.ts` を Read し、各 type 宣言行を特定する
  2. それぞれの `export type Foo` / `export interface Foo` から `export` を削除
  3. ファイル外から import されていないことを `grep -rn "GroupPort\|Trunk\|..." src/ tests/` で再確認
  4. `pnpm test` で既存テストが PASS することを確認
  5. `pnpm lint` でエラーが出ないことを確認
  6. `node scripts/check-dead-exports.mjs` で count が減ったことを確認

  GOD OBJECT 制約: EdgeRenderer.ts は 2702 行 (Max Allowed)。export 削除のみで行数増加なし。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
