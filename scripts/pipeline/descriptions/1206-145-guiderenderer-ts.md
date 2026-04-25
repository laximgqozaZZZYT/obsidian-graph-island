
## Description (subtask of 145-coverage-drop)

src/views/GuideRenderer.ts (現在 stmt 57.8% / fn 66.7%, 155行未カバー) の canvas 依存ロジックと純粋計算を分離。
  - 新規ファイル src/views/guide-math.ts を作成し、以下の純粋関数を抽出
    - グリッド間隔計算（ズーム適応）
    - 目盛りラベル位置計算
    - ガイド描画範囲の世界座標→スクリーン座標変換
  - GuideRenderer.ts は guide-math から import して使用（行数削減）
  - tests/views/guide-math.test.ts に10件以上のテスト追加（ズーム境界、範囲境界、ラベル整列）
  - CanvasRenderingContext2D 依存コードは抽出対象外

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
