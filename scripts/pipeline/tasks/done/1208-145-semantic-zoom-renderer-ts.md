---
priority: high
reported: 2026-04-24
status: done
source: decomposed
parent: 145-coverage-drop
depends: none
summary: semantic-zoom-renderer.ts の純粋計算部分をテストカバー
---

## Description (subtask of 145-coverage-drop)

src/views/semantic-zoom-renderer.ts (現在 stmt 0% / fn 0%, 89行全未カバー) の純粋関数をテスト。
  - ファイルを精査し、LOD ティア判定・ズーム帯域計算・表示要素選択など引数→戻り値の関数を特定
  - 関数が private/非 export なら export 追加（既存シグネチャ維持）
  - Canvas/PIXI 依存の描画部分は除外、純粋計算だけで8件以上テスト
    - ズーム値→LOD ティアのマッピング境界
    - 表示要素選択の threshold 越え前後
    - RenderThresholds の値を尊重しているか
  - ハードコード磁的数値禁止ルール遵守

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
