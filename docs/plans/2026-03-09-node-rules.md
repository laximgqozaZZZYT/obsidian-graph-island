# NodeRule 統一システム Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 既存の `directionalGravityRules` を吸収した統一 `NodeRule[]` を導入し、ノード単位の間隔乗数（spacingMultiplier）と重力（角度・強さ）を全レイアウトに適用する。

**Architecture:** 各 `NodeRule` はクエリ文字列（既存の `matchesFilter` を再利用）でノードをマッチし、`spacingMultiplier`（ノード間隔への乗数）と `gravityAngle`/`gravityStrength`（重力制御）を持つ。レイアウト関数には `Map<string, number>`（nodeId → 合成乗数）を渡し、各レイアウト内部で spacing 計算に乗算する。

**Tech Stack:** TypeScript, d3-force, PIXI.js, vitest

---

## Context

現在、ノード間隔制御はクラスターレイアウトの `clusterNodeSpacing` 一律乗数のみ。ユーザーは「タグ:characterは疎に、degree<3は密に」のようなクエリベースの粒度制御を求めている。また、`directionalGravityRules` は独立した配列だが、同じクエリ対象に対して密度と重力を一箇所で設定できるべき。

## 対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/types.ts` | `NodeRule` 型追加、`DirectionalGravityRule` は残す（後方互換） |
| `src/views/PanelBuilder.ts` | `PanelState` に `nodeRules` 追加、UI セクション追加、旧「方向性重力」セクション削除 |
| `src/layouts/cluster-force.ts` | `ClusterForceConfig` に `nodeSpacingMap` 追加、4つの offset 関数で利用 |
| `src/layouts/concentric.ts` | `ConcentricLayoutOptions` に `nodeSpacingMap` 追加 |
| `src/layouts/tree.ts` | `TreeLayoutOptions` に `nodeSpacingMap` 追加 |
| `src/views/GraphViewContainer.ts` | `computeNodeSpacingMap()` 追加、レイアウト呼び出しに map を渡す、重力に nodeRules 使用 |
| `src/settings.ts` | `defaultNodeRules` 追加（旧 `directionalGravityRules` をマイグレーション） |
| `tests/node-rules.test.ts` | 新規テスト |

---

## Task 1: `src/types.ts` — NodeRule 型定義

**Files:**
- Modify: `src/types.ts`

**Step 1: NodeRule インターフェース追加**

`DirectionalGravityRule` の直後に追加:

```typescript
export interface NodeRule {
  /** Query expression: "tag:character", "degree>5", "*" etc. */
  query: string;
  /** Spacing multiplier (1.0 = default, >1 = sparser, <1 = denser) */
  spacingMultiplier: number;
  /** Gravity direction in degrees (0=right, 90=down, 180=left, 270=up) */
  gravityAngle: number;
  /** Gravity strength (0 = none, 0.01-1.0 = weak-strong) */
  gravityStrength: number;
}
```

**Step 2: GraphViewsSettings に `defaultNodeRules` 追加**

```typescript
// GraphViewsSettings に追加
defaultNodeRules: NodeRule[];

// DEFAULT_SETTINGS に追加
defaultNodeRules: [],
```

**Step 3: ビルド確認**

Run: `npm run build`

---

## Task 2: `src/views/PanelBuilder.ts` — PanelState + UI

**Files:**
- Modify: `src/views/PanelBuilder.ts`

**Step 1: import に `NodeRule` 追加**

```typescript
import type { ..., NodeRule } from "../types";
```

**Step 2: PanelState に `nodeRules` 追加**

```typescript
// PanelState に追加 (directionalGravityRules の直後):
nodeRules: NodeRule[];
```

**Step 3: DEFAULT_PANEL に追加**

```typescript
nodeRules: [],
```

**Step 4: 旧「方向性重力」セクションを「ノードルール」セクションに置換**

現在の `buildSection(panelEl, "方向性重力", ...)` ブロック（248-258行付近）を以下に置換:

```typescript
buildSection(panelEl, "ノードルール", (body) => {
  const ruleListEl = body.createDiv({ cls: "ngp-noderule-list" });
  renderNodeRuleList(ruleListEl, panel, cb);

  const addBtn = body.createEl("button", { cls: "ngp-add-group", text: "ルール追加" });
  addBtn.addEventListener("click", () => {
    panel.nodeRules.push({ query: "*", spacingMultiplier: 1.0, gravityAngle: 0, gravityStrength: 0 });
    renderNodeRuleList(ruleListEl, panel, cb);
    cb.applyNodeRules();
    cb.restartSimulation(0.3);
  });
});
```

**Step 5: `renderNodeRuleList` 関数を追加**

`renderDirectionalGravityList` の直後に追加:

```typescript
const DIRECTION_PRESETS: { value: string; label: string; angle: number }[] = [
  { value: "none", label: "なし", angle: 0 },
  { value: "up", label: "↑ 上", angle: 270 },
  { value: "down", label: "↓ 下", angle: 90 },
  { value: "left", label: "← 左", angle: 180 },
  { value: "right", label: "→ 右", angle: 0 },
  { value: "custom", label: "角度指定", angle: 0 },
];

function renderNodeRuleList(
  container: HTMLElement,
  panel: PanelState,
  cb: PanelCallbacks,
) {
  container.empty();
  const rules = panel.nodeRules;
  rules.forEach((rule, i) => {
    const row = container.createDiv({ cls: "ngp-noderule-row" });

    // --- Row 1: Query ---
    const queryRow = row.createDiv({ cls: "ngp-group-item" });
    const queryInput = queryRow.createEl("input", {
      cls: "ngp-group-query", type: "text",
      placeholder: "tag:character, degree>5, *",
    });
    queryInput.value = rule.query;
    queryInput.style.flex = "1";
    queryInput.addEventListener("input", () => {
      rule.query = queryInput.value;
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });

    const rm = queryRow.createEl("span", { cls: "ngp-group-remove", text: "\u00D7" });
    rm.addEventListener("click", () => {
      rules.splice(i, 1);
      renderNodeRuleList(container, panel, cb);
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });

    // --- Row 2: Spacing + Gravity ---
    const paramRow = row.createDiv({ cls: "ngp-group-item" });
    paramRow.style.paddingLeft = "8px";

    // Spacing multiplier
    paramRow.createEl("span", { text: "間隔", cls: "ngp-hint" });
    const spacingSlider = paramRow.createEl("input", { type: "range" });
    spacingSlider.min = "0.1";
    spacingSlider.max = "5.0";
    spacingSlider.step = "0.1";
    spacingSlider.value = String(rule.spacingMultiplier);
    spacingSlider.style.width = "60px";
    const spacingLabel = paramRow.createEl("span", { cls: "ngp-hint", text: rule.spacingMultiplier.toFixed(1) });
    spacingLabel.style.width = "24px";
    spacingLabel.style.textAlign = "right";
    spacingSlider.addEventListener("input", () => {
      rule.spacingMultiplier = parseFloat(spacingSlider.value);
      spacingLabel.textContent = rule.spacingMultiplier.toFixed(1);
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });

    // Gravity direction
    paramRow.createEl("span", { text: "重力", cls: "ngp-hint" });
    paramRow.style.marginLeft = "4px";
    const dirSelect = paramRow.createEl("select", { cls: "dropdown" });
    dirSelect.style.width = "64px";
    const currentPreset = rule.gravityStrength === 0 ? "none"
      : DIRECTION_PRESETS.find(p => p.value !== "none" && p.value !== "custom" && p.angle === rule.gravityAngle)?.value ?? "custom";
    for (const opt of DIRECTION_PRESETS) {
      const el = dirSelect.createEl("option", { text: opt.label, value: opt.value });
      if (opt.value === currentPreset) el.selected = true;
    }

    // Custom angle input (hidden unless "custom")
    const angleInput = paramRow.createEl("input", { type: "number" });
    angleInput.style.width = "44px";
    angleInput.step = "1";
    angleInput.value = String(rule.gravityAngle);
    angleInput.style.display = currentPreset === "custom" ? "" : "none";

    // Gravity strength slider
    const strSlider = paramRow.createEl("input", { type: "range" });
    strSlider.min = "0.01";
    strSlider.max = "1";
    strSlider.step = "0.01";
    strSlider.value = String(rule.gravityStrength);
    strSlider.style.width = "50px";
    strSlider.style.display = rule.gravityStrength === 0 && currentPreset === "none" ? "none" : "";

    dirSelect.addEventListener("change", () => {
      const val = dirSelect.value;
      if (val === "none") {
        rule.gravityStrength = 0;
        strSlider.style.display = "none";
        angleInput.style.display = "none";
      } else if (val === "custom") {
        rule.gravityAngle = parseFloat(angleInput.value) || 0;
        if (rule.gravityStrength === 0) rule.gravityStrength = 0.1;
        strSlider.value = String(rule.gravityStrength);
        strSlider.style.display = "";
        angleInput.style.display = "";
      } else {
        const preset = DIRECTION_PRESETS.find(p => p.value === val)!;
        rule.gravityAngle = preset.angle;
        if (rule.gravityStrength === 0) rule.gravityStrength = 0.1;
        strSlider.value = String(rule.gravityStrength);
        strSlider.style.display = "";
        angleInput.style.display = "none";
      }
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });

    angleInput.addEventListener("input", () => {
      rule.gravityAngle = parseFloat(angleInput.value) || 0;
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });

    strSlider.addEventListener("input", () => {
      rule.gravityStrength = parseFloat(strSlider.value);
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });
  });
}
```

**Step 6: PanelCallbacks に `applyNodeRules` 追加**

```typescript
// PanelCallbacks に追加:
applyNodeRules(): void;
```

旧 `applyDirectionalGravityForce` コールバックは残す（既存呼び出し元が参照するため GVC 側で同一メソッドにマッピング）。

**Step 7: ビルド確認**

Run: `npm run build`

---

## Task 3: `src/layouts/cluster-force.ts` — per-node spacing

**Files:**
- Modify: `src/layouts/cluster-force.ts`

**Step 1: ClusterForceConfig に `nodeSpacingMap` 追加**

```typescript
// ClusterForceConfig に追加:
/** Per-node spacing multiplier (from NodeRule). Falls back to 1.0 */
nodeSpacingMap?: Map<string, number>;
```

**Step 2: ヘルパー関数 `getSpacing` 追加**

`nodeRadius` 関数の直後に:

```typescript
function getSpacing(nodeId: string, map?: Map<string, number>): number {
  return map?.get(nodeId) ?? 1.0;
}
```

**Step 3: `spiralOffsets` に per-node spacing 適用**

変更箇所 — `minDist` 計算:

```typescript
// 旧 (line 573):
let theta = n > 1 ? (radii[0] + radii[1]) * spacingMul / Math.max(a, 0.01) : 0;

// 新:
const nsMap = cfg?.nodeSpacingMap;
let theta = n > 1 ? (radii[0] + radii[1]) * spacingMul * getSpacing(sorted[0].id, nsMap) / Math.max(a, 0.01) : 0;

// 旧 (line 584):
const minDist = (radii[i] + radii[i + 1]) * spacingMul;

// 新:
const pairSpacing = (getSpacing(sorted[i].id, nsMap) + getSpacing(sorted[i + 1].id, nsMap)) / 2;
const minDist = (radii[i] + radii[i + 1]) * spacingMul * pairSpacing;
```

cfg を引数に追加（関数シグネチャに `cfg?: ClusterForceConfig` を追加）。

**Step 4: `concentricOffsets` に per-node spacing 適用**

変更箇所 — `totalDiamNeeded` 計算:

```typescript
// 旧 (line 634):
let totalDiamNeeded = radii[idx] * 2 * spacingMul;

// 新:
const nsMap = cfg?.nodeSpacingMap;
let totalDiamNeeded = radii[idx] * 2 * spacingMul * getSpacing(sorted[idx].id, nsMap);

// 旧 (line 637):
const nextDiam = nextR * 2 * spacingMul;

// 新:
const nextDiam = nextR * 2 * spacingMul * getSpacing(sorted[idx + cap].id, nsMap);
```

**Step 5: `treeOffsets` に per-node spacing 適用**

```typescript
// 旧: 各ノードの x 配置で一律 nodeSpacing
const nodeSpacing = nodeSize * 2 * spacingMul;

// 新: per-node width
const baseNodeSpacing = nodeSize * 2 * spacingMul;
// 各レベルのノード配置時:
// xPos += baseNodeSpacing * getSpacing(node.id, nsMap)
```

**Step 6: `gridOffsets` に per-node spacing 適用**

```typescript
// 旧:
const spacing = nodeSize * 2 * Math.max(spacingMul, groupScale);

// 新: per-cell spacing
const baseSpacing = nodeSize * 2 * Math.max(spacingMul, groupScale);
// 各セル: spacing = baseSpacing * getSpacing(node.id, nsMap)
```

**Step 7: `computeOffsets` から各 offset 関数に cfg を渡す**

`computeOffsets` は既に `cfg` を持っているので、各呼び出しに渡すだけ。

**Step 8: ビルド確認**

Run: `npm run build`

---

## Task 4: `src/layouts/concentric.ts` — per-node spacing

**Files:**
- Modify: `src/layouts/concentric.ts`
- Modify: `src/types.ts` (ConcentricLayoutOptions)

**Step 1: ConcentricLayoutOptions に `nodeSpacingMap` 追加**

```typescript
export interface ConcentricLayoutOptions {
  // ... existing fields ...
  /** Per-node spacing multiplier from NodeRules */
  nodeSpacingMap?: Map<string, number>;
}
```

**Step 2: `applyConcentricLayout` で per-node spacing 適用**

```typescript
// radius 計算を per-shell 平均 multiplier で調整:
const shellAvgSpacing = shell.reduce((sum, n) =>
  sum + (options?.nodeSpacingMap?.get(n.id) ?? 1.0), 0) / shell.length;
const radius = i === 0 && shell.length === 1
  ? 0
  : minRadius + i * radiusStep * shellAvgSpacing;
```

**Step 3: ビルド確認**

Run: `npm run build`

---

## Task 5: `src/layouts/tree.ts` — per-node spacing

**Files:**
- Modify: `src/layouts/tree.ts`
- Modify: `src/types.ts` (TreeLayoutOptions)

**Step 1: TreeLayoutOptions に `nodeSpacingMap` 追加**

```typescript
export interface TreeLayoutOptions {
  // ... existing fields ...
  nodeSpacingMap?: Map<string, number>;
}
```

**Step 2: `applyTreeLayout` で per-node spacing 適用**

ノードの x 配置計算で、各ノードの幅を multiplier で調整:

```typescript
// 各レベル配置時:
// 旧: x = treeCenterX - levelWidth/2 + j * nodeWidth
// 新: 各ノードの幅を nodeWidth * getSpacing(node.id) とし、累積で配置
const nsMap = options?.nodeSpacingMap;
const getSpacing = (id: string) => nsMap?.get(id) ?? 1.0;

// levelWidth = sum of (nodeWidth * getSpacing(node.id)) for all nodes in level
// x = treeCenterX - levelWidth/2 + cumulative width
```

**Step 3: ビルド確認**

Run: `npm run build`

---

## Task 6: `src/views/GraphViewContainer.ts` — 接続

**Files:**
- Modify: `src/views/GraphViewContainer.ts`

**Step 1: import に `NodeRule` 追加**

```typescript
import type { ..., NodeRule } from "../types";
```

**Step 2: `computeNodeSpacingMap` メソッド追加**

`applyDirectionalGravityForce` の直前に:

```typescript
/**
 * Compute per-node spacing multiplier from nodeRules.
 * Rules are applied in order; multipliers are multiplied together.
 */
private computeNodeSpacingMap(nodes: GraphNode[]): Map<string, number> {
  const rules = this.panel.nodeRules;
  if (rules.length === 0) return new Map();
  const map = new Map<string, number>();
  for (const node of nodes) {
    let mul = 1.0;
    for (const rule of rules) {
      if (matchesFilter(node, rule.query)) {
        mul *= rule.spacingMultiplier;
      }
    }
    if (mul !== 1.0) map.set(node.id, mul);
  }
  return map;
}
```

**Step 3: `applyDirectionalGravityForce` を nodeRules ベースに更新**

既存の `getActiveDirectionalGravityRules()` + `applyDirectionalGravityForce()` を書き換え:

```typescript
private applyNodeRulesForce() {
  if (!this.simulation) return;

  // Merge: settings.directionalGravityRules (legacy) + panel.nodeRules (new)
  const legacyRules = (this.plugin.settings.directionalGravityRules ?? []).map(r => ({
    query: r.filter,
    spacingMultiplier: 1.0,
    gravityAngle: typeof r.direction === "number"
      ? r.direction * 180 / Math.PI  // rad → deg
      : ({ top: 270, bottom: 90, left: 180, right: 0 } as Record<string, number>)[r.direction] ?? 0,
    gravityStrength: r.strength,
  } as NodeRule));
  const nodeRules = [...legacyRules, ...this.panel.nodeRules];

  const gravityRules = nodeRules.filter(r => r.gravityStrength > 0);
  if (gravityRules.length === 0) {
    this.simulation.force("directionalGravity", null);
    return;
  }

  const sim = this.simulation;
  const forceFn = (alpha: number) => {
    const nodes = sim.nodes();
    for (const rule of gravityRules) {
      const rad = rule.gravityAngle * Math.PI / 180;
      const ddx = Math.cos(rad);
      const ddy = Math.sin(rad);
      const str = rule.gravityStrength * alpha;
      for (const node of nodes) {
        if (!matchesFilter(node, rule.query)) continue;
        node.vx! += ddx * str * 100;
        node.vy! += ddy * str * 100;
      }
    }
  };
  this.simulation.force("directionalGravity", forceFn as Force<GraphNode, GraphEdge>);
}
```

**Step 4: コンストラクタ / コールバックの接続**

```typescript
// PanelCallbacks の applyNodeRules を追加:
applyNodeRules: () => { this.applyNodeRulesForce(); this.requestSave(); },

// 旧 applyDirectionalGravityForce コールバックは applyNodeRules と同一に:
applyDirectionalGravityForce: () => { this.applyNodeRulesForce(); this.requestSave(); },
```

**Step 5: レイアウト呼び出しに nodeSpacingMap を渡す**

```typescript
// concentric レイアウト:
const nsMap = this.computeNodeSpacingMap(gd.nodes);
applyConcentricLayout(gd, { ..., nodeSpacingMap: nsMap });

// tree レイアウト:
applyTreeLayout(gd, { ..., nodeSpacingMap: nsMap });

// cluster-force:
buildClusterForce(nodes, edges, degrees, { ..., nodeSpacingMap: nsMap });
```

**Step 6: コンストラクタで nodeRules を初期化**

```typescript
this.panel.nodeRules = [...(plugin.settings.defaultNodeRules ?? [])].map(r => ({ ...r }));
```

**Step 7: ビルド確認**

Run: `npm run build`

---

## Task 7: `src/settings.ts` — 永続設定

**Files:**
- Modify: `src/settings.ts`

既存の「Directional Gravity」セクションの直後に「Default Node Rules」セクションを追加（JSON textarea パターン）:

```typescript
containerEl.createEl("h3", { text: "Default Node Rules" });

const nrDesc = containerEl.createEl("p", {
  text: 'JSON array. Each: { "query": "tag:*", "spacingMultiplier": 1.5, "gravityAngle": 270, "gravityStrength": 0.1 }',
  cls: "setting-item-description",
});
nrDesc.style.fontSize = "0.85em";

const nrTextarea = containerEl.createEl("textarea");
nrTextarea.style.width = "100%";
nrTextarea.style.minHeight = "80px";
nrTextarea.style.fontFamily = "monospace";
nrTextarea.value = JSON.stringify(this.plugin.settings.defaultNodeRules, null, 2);

const nrStatus = containerEl.createEl("div");
nrStatus.style.fontSize = "0.85em";

nrTextarea.addEventListener("input", async () => {
  try {
    const parsed = JSON.parse(nrTextarea.value);
    if (!Array.isArray(parsed)) throw new Error("Must be an array");
    this.plugin.settings.defaultNodeRules = parsed;
    await this.plugin.saveSettings();
    nrStatus.textContent = "Saved.";
    nrStatus.style.color = "var(--text-success)";
  } catch (e) {
    nrStatus.textContent = `Invalid: ${(e as Error).message}`;
    nrStatus.style.color = "var(--text-error)";
  }
});
```

Run: `npm run build`

---

## Task 8: テスト

**Files:**
- Create: `tests/node-rules.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";
vi.mock("pixi.js", () => ({}));

import { matchesFilter } from "../src/layouts/force";
import type { GraphNode } from "../src/types";

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
  return { id, x: 0, y: 0, ...overrides } as GraphNode;
}

describe("computeNodeSpacingMap logic", () => {
  // Inline the computation logic for unit testing
  function computeSpacing(
    nodes: GraphNode[],
    rules: { query: string; spacingMultiplier: number }[],
  ): Map<string, number> {
    const map = new Map<string, number>();
    for (const node of nodes) {
      let mul = 1.0;
      for (const rule of rules) {
        if (matchesFilter(node, rule.query)) {
          mul *= rule.spacingMultiplier;
        }
      }
      if (mul !== 1.0) map.set(node.id, mul);
    }
    return map;
  }

  it("returns empty map when no rules", () => {
    const map = computeSpacing([makeNode("a")], []);
    expect(map.size).toBe(0);
  });

  it("applies wildcard rule to all nodes", () => {
    const map = computeSpacing(
      [makeNode("a"), makeNode("b")],
      [{ query: "*", spacingMultiplier: 2.0 }],
    );
    expect(map.get("a")).toBe(2.0);
    expect(map.get("b")).toBe(2.0);
  });

  it("multiplies multiple matching rules", () => {
    const nodes = [makeNode("a", { tags: ["t1"] })];
    const map = computeSpacing(nodes, [
      { query: "*", spacingMultiplier: 2.0 },
      { query: "tag:t1", spacingMultiplier: 1.5 },
    ]);
    expect(map.get("a")).toBe(3.0);
  });

  it("skips nodes not matching query", () => {
    const nodes = [
      makeNode("a", { tags: ["t1"] }),
      makeNode("b", { tags: ["t2"] }),
    ];
    const map = computeSpacing(nodes, [
      { query: "tag:t1", spacingMultiplier: 2.0 },
    ]);
    expect(map.get("a")).toBe(2.0);
    expect(map.has("b")).toBe(false);
  });

  it("does not add entry for multiplier = 1.0", () => {
    const map = computeSpacing(
      [makeNode("a")],
      [{ query: "*", spacingMultiplier: 1.0 }],
    );
    expect(map.has("a")).toBe(false);
  });
});
```

Run: `npx vitest run tests/node-rules.test.ts`

---

## Task 9: 最終検証

Run: `npm run build && npx vitest run`

- 全テストパス
- ビルド成功
- E2E: Obsidian で動作確認
  - ノードルール追加 → spacing が変化する
  - 重力方向・強さが効く
  - plugin reload 後も nodeRules が保持される
