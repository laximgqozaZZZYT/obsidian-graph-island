---
priority: medium
reported: 2026-04-15
status: pending
source: decomposed
parent: 116-scattered-constants
depends: none
summary: subtask
---

## Description (subtask of 116-scattered-constants)

ワーキングディレクトリが消えていますが、先ほどの調査結果は十分取得できました。分析結果をもとにタスク分解します。

## 調査結果サマリー

- **constants.ts 外の SCREAMING_CASE 定数**: 120個（438個より大幅に少ない — 以前のカウントは別基準の可能性あり）
- **ファイル数**: 約52ファイルに散在
- **分布**: `views/` 32ファイル（57個）、`utils/` 11ファイル（27個）、`layouts/` 7ファイル（15個）、その他数ファイル
- **性質**: ファイルローカル定数（非export）が多い。ドメイン固有の設定値・色・閾値が中心

`★ Insight ─────────────────────────────────────`
- 120個中、**移動すべきでない定数**がある（例: `BOOL_OPS`, `VALID_KEYS` など、そのモジュール専用のSet/Map）。これらを無理にconstants.tsに移すとモジュールの凝集度が下がる
- 移動対象は主に **レンダリング閾値・色・サイズ** などの「設定的」定数。これらはconstants.tsまたはRenderThresholdsに属する
- 2回タイムアウトした理由は「438個全部を移動」が非現実的だったため。**移動対象を厳選**するアプローチが正解
`─────────────────────────────────────────────────`

---

## タスク分解

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
