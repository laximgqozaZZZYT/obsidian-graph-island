## Description (subtask of 200-godobj-extract-tech-debt)

RenderPipeline.ts から純粋関数を 155 行以上 extract する。
  - RenderPipeline.ts を精読し、CLAUDE.md の "Decomposition Priority 4" に列挙された LOD logic / culling logic のうち、this. 依存が浅く extract 可能な単位を 1 つ特定する
  - 新規ファイル `src/views/render-pipeline-helpers/<extracted-name>.ts` を作成し、特定した関数群を移動する (155+ lines)
  - this. 依存箇所は引数化して純粋関数に変換する
  - RenderPipeline.ts 側は新ファイルから import し、wrapper のみを残す
  - CLAUDE.md の `src/views/RenderPipeline.ts` Max Allowed を 2476 → 2321 に戻す
  - `bash scripts/pipeline/god-object-audit.sh` 全 PASS を確認する
  - `pnpm test` 全 PASS を確認する

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
