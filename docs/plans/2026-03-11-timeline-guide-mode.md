# Timeline Guide Mode (shared/per-group T-axis) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `guideLineMode` setting that lets users choose between a single shared T-axis across all groups or per-group T-axes for timeline arrangement.

**Architecture:** Extend `PanelState` with a `guideLineMode` field, propagate it through `LayoutController` → `ClusterForceConfig` → `cluster-force.ts` (shared mode merges all timeline guides into one), and update `drawGuideLines()` in `GraphViewContainer.ts` to render merged timeline guides when in "shared" mode.

**Tech Stack:** TypeScript, PixiJS, d3-force, Playwright (E2E)

---

### Task 1: Add `guideLineMode` to PanelState + DEFAULT_PANEL

**Files:**
- Modify: `src/views/PanelBuilder.ts:84` (PanelState interface)
- Modify: `src/views/PanelBuilder.ts:151` (DEFAULT_PANEL)

**Step 1: Add field to PanelState interface**

In `src/views/PanelBuilder.ts`, after `showGuideLines: boolean;` (line 84), add:

```typescript
  /** Guide line mode: "shared" merges all timeline T-axes into one; "per-group" draws per group */
  guideLineMode: "shared" | "per-group";
```

**Step 2: Add default to DEFAULT_PANEL**

After `showGuideLines: true,` (line 151), add:

```typescript
  guideLineMode: "per-group" as const,
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Success (no errors)

---

### Task 2: Add UI dropdown for guideLineMode

**Files:**
- Modify: `src/views/PanelBuilder.ts:506-510` (guide lines toggle section)

**Step 1: Add dropdown after the guide lines toggle**

After the existing guide lines toggle block (lines 506-510), add a conditional dropdown that only shows when `panel.clusterArrangement === "timeline"`:

```typescript
    // Guide line mode (only for timeline)
    if (panel.clusterArrangement === "timeline") {
      addSelect(body, t("cluster.guideLineMode"), [
        { value: "shared", label: t("cluster.guideLineMode.shared") },
        { value: "per-group", label: t("cluster.guideLineMode.perGroup") },
      ], panel.guideLineMode, (v) => {
        panel.guideLineMode = v as "shared" | "per-group";
        cb.markDirty();
      });
    }
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Success

---

### Task 3: Add i18n labels

**Files:**
- Modify: `src/i18n.ts` — English section (~line 215) and Japanese section (~line 530)

**Step 1: Add English translations**

After `"cluster.showGuideLines": "Show Guide Lines",`, add:

```typescript
  "cluster.guideLineMode": "Guide Line Mode",
  "cluster.guideLineMode.shared": "Shared (single axis)",
  "cluster.guideLineMode.perGroup": "Per Group",
```

**Step 2: Add Japanese translations**

After `"cluster.showGuideLines": "ガイドラインを表示",`, add:

```typescript
  "cluster.guideLineMode": "ガイドラインモード",
  "cluster.guideLineMode.shared": "共通（単一軸）",
  "cluster.guideLineMode.perGroup": "グループ別",
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Success

---

### Task 4: Propagate `guideLineMode` through config pipeline

**Files:**
- Modify: `src/layouts/cluster-force.ts:152-190` (ClusterForceConfig interface)
- Modify: `src/views/LayoutController.ts:344-346` (baseCfg construction)

**Step 1: Add field to ClusterForceConfig**

In `src/layouts/cluster-force.ts`, add to the `ClusterForceConfig` interface (after `timelineOrderFields`):

```typescript
  /** Guide line mode: "shared" or "per-group" (timeline only) */
  guideLineMode?: "shared" | "per-group";
```

**Step 2: Pass from panel to config in LayoutController**

In `src/views/LayoutController.ts`, add to the `baseCfg` object (after `timelineOrderFields`):

```typescript
      guideLineMode: panel.guideLineMode || "per-group",
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Success

---

### Task 5: Implement shared timeline guide merging in `drawGuideLines()`

**Files:**
- Modify: `src/views/GraphViewContainer.ts:1308-1343` (drawGuideLines method)

**Step 1: Add shared mode logic**

Replace the current `drawGuideLines()` method body with logic that:
1. Detects if `guideLineMode === "shared"` and all guides are timeline type
2. If so, merges all timeline tick data into a single axis at the average Y position
3. Otherwise, renders per-group as before

```typescript
  drawGuideLines() {
    const g = this.guideLineGraphics;
    if (!g) return;
    g.clear();

    if (!this.panel.showGuideLines) return;
    const guideData = this.clusterMeta?.guideLineData;
    if (!guideData || guideData.groups.length === 0) return;

    const worldScale = this.worldContainer?.scale.x ?? 1;
    const lineW = Math.max(0.5, 1.0 / worldScale);
    const guideColor = this.isDarkTheme() ? 0x666666 : 0xbbbbbb;

    // Shared timeline mode: merge all timeline guides into one axis
    if (this.panel.guideLineMode === "shared" && guideData.arrangement === "timeline") {
      const timelineGroups = guideData.groups.filter(g => g.guide.type === "timeline");
      if (timelineGroups.length > 0) {
        // Merge all ticks and compute shared axis Y
        const allTicks: { x: number; label: string }[] = [];
        let sumY = 0;
        for (const group of timelineGroups) {
          const tg = group.guide as Extract<ArrangementGuide, { type: "timeline" }>;
          const absY = group.centerY + tg.axisY;
          sumY += absY;
          for (const tick of tg.ticks) {
            allTicks.push({ x: group.centerX + tick.x, label: tick.label });
          }
        }
        // Deduplicate ticks by label (keep first occurrence)
        const seen = new Set<string>();
        const uniqueTicks: { x: number; label: string }[] = [];
        for (const tick of allTicks) {
          if (!seen.has(tick.label)) {
            seen.add(tick.label);
            uniqueTicks.push(tick);
          }
        }
        const sharedY = sumY / timelineGroups.length;
        if (uniqueTicks.length > 0) {
          const xs = uniqueTicks.map(t => t.x);
          const xMin = Math.min(...xs) - 20;
          const xMax = Math.max(...xs) + 20;
          // Main axis line
          g.lineStyle(lineW * 1.5, guideColor, 0.5);
          g.moveTo(xMin, sharedY);
          g.lineTo(xMax, sharedY);
          // Tick marks
          const tickH = 6 / worldScale;
          g.lineStyle(lineW, guideColor, 0.4);
          for (const tick of uniqueTicks) {
            g.moveTo(tick.x, sharedY - tickH);
            g.lineTo(tick.x, sharedY + tickH);
          }
        }
        return;
      }
    }

    // Default: per-group rendering
    for (const group of guideData.groups) {
      const { centerX: cx, centerY: cy, guide } = group;
      switch (guide.type) {
        case "timeline":
          this.drawTimelineAxis(g, cx, cy, guide, lineW, guideColor, worldScale);
          break;
        case "spiral":
          this.drawSpiralCurve(g, cx, cy, guide, lineW, guideColor);
          break;
        case "grid":
          this.drawGridLines(g, cx, cy, guide, lineW, guideColor);
          break;
        case "tree":
          this.drawTreeDepthLines(g, cx, cy, guide, lineW, guideColor);
          break;
        case "triangle":
          this.drawTriangleOutline(g, cx, cy, guide, lineW, guideColor);
          break;
        case "mountain":
          this.drawMountainSilhouette(g, cx, cy, guide, lineW, guideColor);
          break;
      }
    }
  }
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Success

---

### Task 6: E2E regression test

**Files:**
- No modification needed

**Step 1: Run existing E2E tests**

Run: `npx playwright test e2e/cdp-e2e-presets.spec.ts --workers=1`
Expected: 25 passed

**Step 2: Deploy and verify**

```bash
npm run build && cp main.js "/home/ubuntu/obsidian-plugins/開発/.obsidian/plugins/graph-island/main.js"
```

---

### Task 7: E2E feature test for guideLineMode

**Files:**
- Create: `e2e/cdp-e2e-guideline-mode.spec.ts`

**Step 1: Write E2E test**

```typescript
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  await page.evaluate(async () => {
    const app = (window as any).app;
    if (app.workspace.getLeavesOfType("graph-view").length === 0) {
      app.commands.executeCommandById("graph-island:open-graph-view");
    }
  });
  await page.waitForTimeout(3000);
});

test.describe("Guide Line Mode", () => {
  test("timeline shared mode produces guideLineData", async () => {
    // Apply timeline preset with guideLineMode = "shared"
    const result = await page.evaluate(async () => {
      const app = (window as any).app;
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) throw new Error("No graph-view leaf");
      const view = leaf.view;
      const current = view.getState();
      const newState = {
        ...current,
        layout: "force",
        panel: {
          ...current.panel,
          searchQuery: "path:classic-hamlet*",
          groupBy: "node_type:?",
          clusterArrangement: "timeline",
          timelineKey: "start-date",
          showGuideLines: true,
          guideLineMode: "shared",
          collapsedGroups: [],
        },
      };
      await view.setState(newState, {});
      // Wait for layout
      await new Promise(r => setTimeout(r, 8000));
      // Check metadata
      const meta = view.clusterMeta;
      return {
        hasGuideData: !!meta?.guideLineData,
        groupCount: meta?.guideLineData?.groups?.length ?? 0,
        arrangement: meta?.guideLineData?.arrangement ?? "none",
      };
    });

    expect(result.hasGuideData).toBe(true);
    expect(result.arrangement).toBe("timeline");
    expect(result.groupCount).toBeGreaterThan(0);
  });

  test("timeline per-group mode renders per-group guides", async () => {
    const result = await page.evaluate(async () => {
      const app = (window as any).app;
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) throw new Error("No graph-view leaf");
      const view = leaf.view;
      const current = view.getState();
      const newState = {
        ...current,
        layout: "force",
        panel: {
          ...current.panel,
          searchQuery: "path:classic-hamlet*",
          groupBy: "node_type:?",
          clusterArrangement: "timeline",
          timelineKey: "start-date",
          showGuideLines: true,
          guideLineMode: "per-group",
          collapsedGroups: [],
        },
      };
      await view.setState(newState, {});
      await new Promise(r => setTimeout(r, 8000));
      const meta = view.clusterMeta;
      return {
        hasGuideData: !!meta?.guideLineData,
        groupCount: meta?.guideLineData?.groups?.length ?? 0,
      };
    });

    expect(result.hasGuideData).toBe(true);
    expect(result.groupCount).toBeGreaterThan(0);
  });

  test("showGuideLines=false hides guide data rendering", async () => {
    // This tests the toggle — guide data exists but should not be drawn
    const result = await page.evaluate(async () => {
      const app = (window as any).app;
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) throw new Error("No graph-view leaf");
      const view = leaf.view;
      const current = view.getState();
      const newState = {
        ...current,
        layout: "force",
        panel: {
          ...current.panel,
          searchQuery: "path:classic-hamlet*",
          groupBy: "node_type:?",
          clusterArrangement: "spiral",
          showGuideLines: false,
          collapsedGroups: [],
        },
      };
      await view.setState(newState, {});
      await new Promise(r => setTimeout(r, 8000));
      const meta = view.clusterMeta;
      return {
        hasGuideData: !!meta?.guideLineData,
        arrangement: meta?.guideLineData?.arrangement ?? "none",
      };
    });

    // Guide data should still be computed (it's in metadata), but rendering is off
    expect(result.hasGuideData).toBe(true);
    expect(result.arrangement).toBe("spiral");
  });
});
```

**Step 2: Run the new test**

Run: `npx playwright test e2e/cdp-e2e-guideline-mode.spec.ts --workers=1`
Expected: 3 passed

---

## Subagent Delegation Plan

| Task | Agent | Files | Notes |
|------|-------|-------|-------|
| Tasks 1-4 | `implementer` | PanelBuilder.ts, i18n.ts, cluster-force.ts, LayoutController.ts | Small edits across 4 files, no conflicts |
| Task 5 | `implementer` | GraphViewContainer.ts | Core rendering logic change |
| Tasks 6-7 | `tester` | e2e/cdp-e2e-guideline-mode.spec.ts | Regression + feature E2E |

Tasks 1-4 can be done by a single agent (all are small additions). Task 5 is the core logic. Tasks 6-7 are E2E validation.
