---
priority: medium
reported: 2026-04-06
status: done
source: decomposed
parent: 015-autofit-viewport-broken
depends: none
summary: subtask
---

## Description (subtask of 015-autofit-viewport-broken)

`★ Insight ─────────────────────────────────────`
重要な発見: `_autoFocusActiveFile()` (L8130-8137) が **大グラフ(>500ノード)で初回起動時に `localGraphCenter` を設定し `doRender()` を再呼出し**している。これが autoFitView 直後に発動すると、全体フィットの結果が上書きされ、局所グラフに切り替わる。さらに simulation end ハンドラ内の実行順序は: `autoFitView` → `_autoFocusActiveFile` → `_persistAllPositions` なので、autoFit の結果が即座にローカルグラフ切り替えで無効化される可能性が高い。
`─────────────────────────────────────────────────`

十分な調査ができました。以下がタスク分解です。

---

## タスク分解結果

**根本原因分析**: コードを精査した結果、以下の3つの競合する仕組みが問題を引き起こしている可能性が高い:

1. **`_autoFocusActiveFile()`** (L8130-8137): 大グラフ(>500ノード)で初回起動時に `localGraphCenter` を自動設定し `doRender()` を再呼出し → autoFitView の結果が無効化される
2. **`_suppressAutoFit` の解除タイミング**: simulation end の最後(L7602)で解除されるが、`requestAnimationFrame` 内の autoFit (L7592) がその前に `_suppressAutoFit=true` で弾かれる可能性
3. **`computeAutoFitTransform` の `minScale` ガード** (L859-863): `configMinScale > 0` かつ `naturalScale < configMinScale` のとき、`visibleFraction < 0.8` なら naturalScale を使うが、ノードが偏在していると不適切なスケールになる可能性

---

```

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
