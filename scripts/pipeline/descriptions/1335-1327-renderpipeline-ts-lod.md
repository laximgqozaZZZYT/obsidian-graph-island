## Description (subtask of 1327-god-object-violation)

src/views/RenderPipeline.ts は現在 2657 行で limit 2476 を 181 行超過している。
  CLAUDE.md の decomposition priority 4 に従い、LOD 判定ロジックを
  新規ファイル src/views/render-pipeline/lod.ts へ純粋関数として抽出する。

  手順:
  1. src/views/RenderPipeline.ts を精読し、LOD 関連
     (computeLodTier, shouldRenderAtLod, LOD 閾値判定、tier 計算など)
     を特定する。project_lod_spec_v21.md の LODティア仕様を参照。
  2. それらを新規ファイル src/views/render-pipeline/lod.ts に
     pure function として export する (zoom, density 等を引数で受ける形)。
  3. RenderPipeline.ts は import して呼び出すだけに置き換える。
  4. RenderThresholds の閾値はそのまま使う (hardcoded 化禁止)。
  5. pnpm test 全 PASS を確認。
  6. 完了条件: src/views/RenderPipeline.ts が 2476 行以下になる。

  禁止: 挙動変更、新規閾値追加、CLAUDE.md GOD OBJECT Policy の
  Max Allowed 引き上げ。culling logic の抽出は本タスクのスコープ外
  (LOD だけで 181 行削れない場合のみ補助的に抽出可)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
