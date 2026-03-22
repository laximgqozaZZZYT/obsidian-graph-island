# Card Golden Ratio + Content Scale Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make all cards (plain + table) golden-ratio landscape, and add log-scale body-length sizing so content-rich nodes appear larger.

**Architecture:** Add `bodyLength` to `GraphNode` (computed alongside `bodyPreview`), apply log-scale radius boost in `effectiveRadius()` gated by new `cardContentScale` setting. Unify plain card aspect ratio with table card (both use `cardAspectRatio`). Fix z-index hierarchy for hover overlap. Add E2E tests.

**Tech Stack:** TypeScript, PixiJS (Canvas2D), Vitest, Playwright CDP

---

### Task 1: Add `bodyLength` to GraphNode + metadata parser

**Files:**
- Modify: `src/types.ts:26` (GraphNode interface)
- Modify: `src/parsers/metadata-parser.ts:84-92` (extractBodyPreview call site)
- Test: `src/parsers/__tests__/metadata-parser.test.ts` (if exists, else inline verification)

**Step 1: Add bodyLength field to GraphNode**

In `src/types.ts`, after line 26 (`bodyPreview`):
```typescript
/** Full body text length (YAML stripped) for content-proportional card sizing */
bodyLength?: number;
```

**Step 2: Populate bodyLength in metadata-parser.ts**

In `src/parsers/metadata-parser.ts`, modify both branches (~line 86-92):
```typescript
// Sync branch
if (typeof rawContent === "string") {
  const body = stripFrontmatter(rawContent);
  node.bodyPreview = extractBodyPreview(rawContent, 100);
  node.bodyLength = body.length;
}
// Async branch
(rawContent as Promise<string>).then(text => {
  node.bodyPreview = extractBodyPreview(text, 100);
  node.bodyLength = stripFrontmatter(text).length;
}).catch(() => {});
```

Note: `stripFrontmatter` logic already exists inside `extractBodyPreview`. Extract it as a reusable helper to avoid duplication.

**Step 3: Build and verify no type errors**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**
```bash
git add src/types.ts src/parsers/metadata-parser.ts
git commit -m "feat: add bodyLength to GraphNode for content-proportional card sizing"
```

---

### Task 2: Add `cardContentScale` setting + UI slider

**Files:**
- Modify: `src/types.ts` (RenderThresholds interface + defaults)
- Modify: `src/views/PanelBuilder.ts` (add slider in Display section)
- Modify: `src/i18n.ts` (add labels)

**Step 1: Add field to RenderThresholds**

In `src/types.ts` RenderThresholds interface (after cardBodyMaxLines ~line 747):
```typescript
/** HM: Card content scale — log-based size boost from body length (0=off, 0.5=default, 2.0=max) */
cardContentScale?: number;
```

In DEFAULT_RENDER_THRESHOLDS:
```typescript
cardContentScale: 0.5,
```

**Step 2: Add i18n labels**

In `src/i18n.ts` (EN section):
```typescript
"display.cardContentScale": "Card Size by Content",
"desc.cardContentScale": "Scale card size proportional to body text length (log scale)",
```

In JA section:
```typescript
"display.cardContentScale": "本文量カードサイズ",
"desc.cardContentScale": "本文の文字数に比例してカードサイズを調整（対数スケール）",
```

**Step 3: Add slider to PanelBuilder**

In `src/views/PanelBuilder.ts`, find the card display section (near `cardBodyMaxLines` or `plainCardWidthFactor`).
Add slider: range 0–2.0, step 0.1, default 0.5. On change: `cb.recalcNodeRadii(); cb.markDirty();`

```typescript
addSlider(container, t("display.cardContentScale"), 0, 2.0, 0.1,
  rtNode.cardContentScale ?? 0.5,
  (v) => {
    panel.renderThresholds.cardContentScale = v;
    cb.recalcNodeRadii();
    cb.markDirty();
  }, t("desc.cardContentScale"));
```

**Step 4: Build and verify**
Run: `npx tsc --noEmit && npm run build`

**Step 5: Commit**
```bash
git add src/types.ts src/views/PanelBuilder.ts src/i18n.ts
git commit -m "feat: HM cardContentScale slider — log-based card size by body length"
```

---

### Task 3: Apply content scale to effectiveRadius

**Files:**
- Modify: `src/layouts/cluster-force.ts:878-899` (nodeRadius + effectiveRadius)
- Modify: `src/views/RenderPipeline.ts:2256-2261` (pass bodyLength + scale)
- Modify: `src/views/LayoutController.ts:82` (pass bodyLength + scale)
- Modify: `src/views/GraphViewContainer.ts` (recalcNodeRadii — pass params)

**Step 1: Extend effectiveRadius signature**

In `src/layouts/cluster-force.ts`, add optional params:
```typescript
export function effectiveRadius(
  n: GraphNode, nodeSize: number, degree: number,
  maxNodeRadius = 60, minNodeRadius = 15, maxDegree = 0, sizeByDegree = false,
  bodyLength = 0, maxBodyLength = 0, cardContentScale = 0,
): number {
  let baseR = nodeRadius(nodeSize, degree, minNodeRadius, maxDegree, sizeByDegree);
  // HM: content-proportional scaling (log)
  if (cardContentScale > 0 && maxBodyLength > 0 && bodyLength > 0) {
    const t = Math.log(bodyLength + 1) / Math.log(maxBodyLength + 1);
    baseR *= (1 + cardContentScale * t);
  }
  const cap = maxNodeRadius > 0 ? maxNodeRadius : Infinity;
  if (n.collapsedMembers && n.collapsedMembers.length > 0) {
    return Math.max(Math.min(Math.max(baseR, baseR * (1 + Math.sqrt(n.collapsedMembers.length) * 0.5)), cap), minNodeRadius);
  }
  return Math.max(Math.min(baseR, cap), minNodeRadius);
}
```

**Step 2: Compute maxBodyLength and pass through call sites**

In `GraphViewContainer.ts` `recalcNodeRadii()`, compute:
```typescript
const maxBodyLength = Math.max(1, ...Array.from(this.pixiNodes.values()).map(pn => pn.data.bodyLength ?? 0));
```
Pass to effectiveRadius calls.

Similarly update RenderPipeline.ts and LayoutController.ts call sites.

**Step 3: Build and verify**
Run: `npx tsc --noEmit && npm run build`

**Step 4: Commit**
```bash
git add src/layouts/cluster-force.ts src/views/RenderPipeline.ts src/views/LayoutController.ts src/views/GraphViewContainer.ts
git commit -m "feat: HM content-proportional radius scaling via log(bodyLength)"
```

---

### Task 4: Apply golden ratio to plain cards

**Files:**
- Modify: `src/views/RenderPipeline.ts:1527-1543` (_renderPlainCard)
- Modify: `src/views/GraphViewContainer.ts:2455-2478` (hit-test config)
- Modify: `src/views/GraphViewContainer.ts:7934-7938` (search halo card rect)

**Step 1: Use cardAspectRatio in plain card width calculation**

In `_renderPlainCard` (RenderPipeline.ts ~line 1531), replace:
```typescript
const halfW = Math.max(MIN_PLAIN_HALF_W, Math.min(cardMaxW / 2, effR * crc.plainCardWidthFactor));
```
with:
```typescript
const cardAR = crc.cardAspectRatio > 0 ? crc.cardAspectRatio : 1.618;
const arHalfW = (totalH * cardAR) / 2;
const halfW = Math.max(MIN_PLAIN_HALF_W, Math.min(cardMaxW / 2, arHalfW));
```

Note: `totalH` already accounts for body lines + meta fields, so the golden ratio naturally produces landscape cards.

But totalH is computed AFTER halfW in current code. Reorder: compute totalH first (using a preliminary width estimate), then compute halfW from totalH × AR.

**Step 2: Update hit-test config for plain cards**

In `GraphViewContainer.ts` hit-test config (~line 2462-2476), ensure plain card hit-test uses same AR logic.

**Step 3: Update search halo card rect**

In `GraphViewContainer.ts` (~line 7934-7938), update the halo rect to use golden ratio width.

**Step 4: Build and verify**
Run: `npx tsc --noEmit && npm run build`

**Step 5: Commit**
```bash
git add src/views/RenderPipeline.ts src/views/GraphViewContainer.ts
git commit -m "feat: HM golden ratio applied to plain cards (landscape)"
```

---

### Task 5: Z-index hierarchy fix for hover overlap

**Files:**
- Modify: `styles.css` (z-index values)

**Step 1: Establish z-index hierarchy**

Current problem: multiple panels share z-index:5, tooltip at z-index:8, help at z-index:200.

New hierarchy:
```
Layer 1 (z:1)   — canvas background elements
Layer 5 (z:5)   — minimap, legend (passive info)
Layer 6 (z:6)   — graph-stats, oob-badge (status overlay)
Layer 8 (z:8)   — node-info tooltip (hover priority)
Layer 10 (z:10) — aria-live region
Layer 15 (z:15) — settings panel
Layer 20 (z:20) — modal dialogs
Layer 200 (z:200) — help overlay (unchanged)
```

Specific changes in `styles.css`:
- `.gi-minimap-wrap`: keep z-index:5
- `.gi-legend`: keep z-index:5
- `.gi-graph-stats`: z-index:5 → z-index:6
- `.gi-oob-badge`: add z-index:7 (if not set)
- `.gi-node-info`: keep z-index:8

**Step 2: Build and verify**
Run: `npm run build`

**Step 3: Commit**
```bash
git add styles.css
git commit -m "fix: HM z-index hierarchy — stats(6), oob(7), node-info(8) to prevent overlap"
```

---

### Task 6: A11y — announce card content scale changes

**Files:**
- Modify: `src/views/GraphViewContainer.ts` (a11y announce in slider callback)

**Step 1: Add a11y announcement for cardContentScale changes**

When the slider value changes, announce via `_announceA11y`:
```typescript
this._announceA11y(`Card content scale: ${(v * 100).toFixed(0)}%`);
```

**Step 2: Commit**
```bash
git add src/views/GraphViewContainer.ts
git commit -m "a11y: HM announce card content scale changes"
```

---

### Task 7: E2E tests

**Files:**
- Create: `e2e/cdp-e2e-cycle54-card-content-scale.spec.ts`

**Step 1: Write E2E tests**

Tests to cover:
1. **HM-1**: Card mode renders with golden ratio (width > height for visible cards)
2. **HM-2**: cardContentScale slider exists and is adjustable
3. **HM-3**: Changing cardContentScale causes visible size difference between high-bodyLength and low-bodyLength nodes
4. **HM-4**: Z-index: node-info tooltip appears above legend/stats when overlapping
5. **HM-5**: A11y: changing cardContentScale triggers aria-live announcement
6. **HM-6**: Display mode switch card→node→card maintains golden ratio
7. **HM-7**: Hover on card does not overlap with legend panel
8. **HM-8**: Console error monitor during card mode interactions (zoom, hover, mode switch)

Each test: set display mode to "card", manipulate settings via CDP, verify visual/DOM state.

Timeout: 5 minutes total for all tests.

**Step 2: Run tests**
Run: `npx playwright test e2e/cdp-e2e-cycle54-card-content-scale.spec.ts --timeout 300000`

**Step 3: Commit**
```bash
git add e2e/cdp-e2e-cycle54-card-content-scale.spec.ts
git commit -m "test: HM cycle 54 E2E — card golden ratio + content scale (8 tests)"
```

---

### Task 8: Deploy + verify + push

**Step 1: Full build**
Run: `npm run build`

**Step 2: Deploy**
Run: `cp main.js "/home/ubuntu/obsidian-plugins/開発/.obsidian/plugins/graph-island/main.js"`

**Step 3: Run full E2E suite**
Run: `npx playwright test e2e/ --timeout 300000`

**Step 4: Push**
Run: `git push`
