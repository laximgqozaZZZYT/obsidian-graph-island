## Description (subtask of 1327-god-object-violation)

src/views/RenderPipeline.ts は現在 2657 行で CLAUDE.md の上限 2476 を 181 行超過している。
  
  作業手順:
  1. src/views/RenderPipeline.ts を精読し、LOD ティア判定ロジック（zoom / node count / threshold に基づく LOD 段階決定、ノード/エッジに対する LOD 適用判定など、project_lod_spec_v21.md 準拠の関数群）を特定する。
  2. 特定したロジックを新規ファイル src/views/render-pipeline/lod-classifier.ts に純粋関数として export する形で抽出する。RenderThresholds と必要パラメータを引数で受け取る形にする。
  3. RenderPipeline.ts 側は新ファイルから import して呼び出すだけに置き換え、抽出元のメソッド本体は削除する。181 行以上削減を目標に、不足する場合は LOD 関連のヘルパー（debounce 計算、LOD バケット化など）も追加で抽出する。
  4. 抽出後、RenderPipeline.ts の行数が 2476 以下であることを `wc -l src/views/RenderPipeline.ts` で確認する。
  5. `pnpm test` を実行し、RenderPipeline / LOD 関連の既存テストが PASS することを確認する。
  6. `pnpm lint` と `pnpm format:check` を実行して通すこと。
  
  禁止事項:
  - RenderPipeline.ts の行数を増やさない（必ず 2476 以下にする）。
  - LOD ティアの境界値・閾値を変更しない。RenderThresholds 経由の参照を維持する。
  - culling ロジックには手を出さない（本タスクのスコープ外）。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
