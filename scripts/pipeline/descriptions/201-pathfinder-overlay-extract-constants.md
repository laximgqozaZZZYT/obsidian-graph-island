## Description

`src/views/pathfinder-overlay.ts` 内のインライン数値リテラル (色値・パルス速度・グロー幅・ラベルオフセット等) を `src/constants.ts` に `PATHFINDER_*` プレフィクスで extract する。

旧 chain (1234→1236→1237→1240→1241→1242→1246-1251) が「定数追加」と「リテラル置換」を細かく分解した結果、複数 task が "done" のまま実態が伴わず、子 task が「依存先が不在」で何もできず stuck していた (Phase I3 で全 cancel 済)。

ここでは **1 task で完結** させる:
1. `pathfinder-overlay.ts` を全文読み、数値リテラルを 10〜15 個特定
2. `src/constants.ts` の `// ---- Renderer decorations ----` セクション付近に `export const PATHFINDER_*` を追加
3. `pathfinder-overlay.ts` の該当箇所を定数参照に置換 (Edit)
4. ズーム/LOD/密度スケール係数のリテラルは置換しない (これらは描画文脈依存で意味がインライン依存)
5. `pnpm lint && pnpm test` 全 PASS を確認
6. CLAUDE.md の "Hardcoded magic numbers in render/layout logic" 違反を解消

## Acceptance criteria

- [ ] `src/constants.ts` に `PATHFINDER_*` 定数が 10 個以上追加されている
- [ ] `pathfinder-overlay.ts` 内のインライン数値リテラル (zoom 系除く) がほぼなくなっている
- [ ] `grep '^export const PATHFINDER_' src/constants.ts | wc -l` ≥ 10
- [ ] pnpm lint / pnpm test / pnpm build 全 PASS
- [ ] godobj-audit.sh 全 PASS (新規 file 追加なし、constants.ts は god-object 対象外)

## Notes

- 推定行数増: constants.ts に +30〜50 行 / pathfinder-overlay.ts は -0 行 (置換のみ)
- 1 cycle (max-turns 30) で完結する規模
