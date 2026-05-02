## Description (subtask of 1607-dead-exports)

src/views/EdgeRenderer.ts L118-L128 の 11 個の type-only export(GroupPort, Trunk, TrunkCable, NodePort, IntraGroupCable, CableRouteOpts, GroupPerimInfo, PolarJunctionGrid, PortLaneInfo, PortColorLanes, CablePrepResult)を knip / ts-prune で再確認し、各シンボルについて以下のいずれかを実施する。
  - tests/ や他モジュールから一切 import されていない場合: type 宣言ごと削除
  - 同じファイル内でのみ使われている場合: `export interface` / `export type` の `export` キーワードのみ外す
  - 他モジュール参照がある場合: そのまま残す(対象外と記録)
  完了条件:
  - `pnpm test` 全 PASS
  - `pnpm lint` PASS
  - `pnpm build` 成功 (bundle size 800KB 以内)
  - `node scripts/check-dead-exports.mjs` の types カウントが現在より減少
  GOD OBJECT 制約: EdgeRenderer.ts は Max Allowed 2765行 (現状)。型削除/`export` 外しのみで行数増減は許容範囲内に収める。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
