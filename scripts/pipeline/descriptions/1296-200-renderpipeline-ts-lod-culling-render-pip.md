## Description (subtask of 200-godobj-extract-tech-debt)

CLAUDE.md の "Decomposition Priority 4" のヒントに従い、RenderPipeline.ts (現在 2476 行) を精読して LOD logic と culling logic の純粋関数候補を特定する。
  - 候補抽出の指針: スコープ内で `this.` を使わない関数、または引数化で `this.` を排除できる関数を優先する。
  - 新規ファイル `src/views/render-pipeline-helpers/lod-culling.ts` を作成し、抽出対象関数を移動する。
  - RenderPipeline.ts 側は新ファイルから import して呼び出すよう書き換える。
  - 抽出後の RenderPipeline.ts 実行行数を `wc -l` で確認し、CLAUDE.md の "Max Allowed" を実測値に更新する (ratchet down only、目標は 2321 だが 1 ステップで届かない場合は到達した値で更新する)。
  - 検証: `pnpm test` 全 PASS、`bash scripts/pipeline/god-object-audit.sh` 全 PASS、`pnpm lint` PASS。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
