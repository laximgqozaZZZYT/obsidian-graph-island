## Description (subtask of 1327-god-object-violation)

src/views/RenderPipeline.ts (現在 2657 行 / 上限 2476 行) を精読し、CLAUDE.md の
  decomposition 指針 (LOD logic, culling logic) に従って独立した純粋関数または
  独立クラスを src/views/render-pipeline/ 配下の新規ファイルへ抽出する。
  抽出対象は精読の上で確定すること (例: LOD ティア判定関数、視錐台/可視判定関数、
  距離別フィルタ関数など)。RenderPipeline.ts からは抽出関数を import して使用する
  ように書き換え、ファイル行数を 2476 行以下にする。
  作業手順:
    1. wc -l src/views/RenderPipeline.ts で現在行数を確認
    2. RenderPipeline.ts を読み、抽出可能な独立ロジックブロック (LOD 計算、culling
       判定など) を特定
    3. src/views/render-pipeline/ 以下に新規ファイルを作成し関数を移動
    4. RenderPipeline.ts 側を import 経由の呼び出しに置き換える
    5. pnpm test で既存テストが緑のままであることを確認
    6. wc -l src/views/RenderPipeline.ts で 2476 行以下を確認
  禁止事項:
    - CLAUDE.md の Max Allowed を引き上げる変更
    - public API の互換を壊す変更
    - 既存の RenderThresholds の定数値を変更する作業 (今回のスコープ外)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
