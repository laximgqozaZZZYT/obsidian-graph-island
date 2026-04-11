---
priority: high
reported: 2026-04-11
status: in-progress
source: kaizen
summary: CableTrayRenderer.buildRoutingPath で同一座標ノード間のエッジがゼロ除算を起こす
---
## Description
`src/views/CableTrayRenderer.ts:380-382` の fallback perpendicular offset パスで、
`from` と `to` が同一座標（自己参照エッジ等）の場合に `len = 0` となり、
`perpX = -dy / 0` → `±Infinity` が座標に混入する。

```ts
const len = Math.sqrt(dx * dx + dy * dy);  // line 380: len = 0 when from == to
const perpX = -dy / len,                    // line 381: Infinity
      perpY = dx / len;                     // line 382: NaN or Infinity
```

同じ計算パターンの `EdgeLabelRenderer.ts:157` は `Math.sqrt(...) || 1` でガードしており、
CableTrayRenderer だけガードが欠落している（一貫性の欠如）。

Infinity 座標が Canvas の `lineTo` / `moveTo` に渡されると描画が壊れる。

## Acceptance criteria
- [ ] `CableTrayRenderer.ts:380` を `const len = Math.sqrt(dx * dx + dy * dy) || 1;` に修正
- [ ] 同一座標エッジでの `buildRoutingPath` が有限の座標を返すことをテストで検証
