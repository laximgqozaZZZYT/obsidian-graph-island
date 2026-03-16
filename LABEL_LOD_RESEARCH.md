# Label Rendering & LOD System Research — obsidian-graph-island

## Research Query
Map the complete label rendering and Level-of-Detail (LOD) system, including:
1. How labels respond to zoom changes (applyTextFade, updateLabelsForZoom)
2. Collision detection and overlap culling algorithm
3. Zoom tier thresholds and degree percentile filtering
4. Event flow from zoom to label visibility updates
5. Screen-space AABB calculation for overlap detection

---

## 1. Event Flow: Zoom → Label Updates

### Entry Point: Wheel Zoom in InteractionManager
**File**: `src/views/InteractionManager.ts` (lines 171-195)

Wheel zoom handler:
- Adjusts `world.scale` by factor (1.1 for zoom-in, 0.9 for zoom-out)
- Clamps to [0.02, 10]
- IMMEDIATELY calls `updateLabelsForZoom()` for semantic zoom response
- DEBOUNCED (500ms) calls `onZoomLayoutUpdate()` for layout recalculation

### Label Update Trigger: updateLabelsForZoom
**File**: `src/views/GraphViewContainer.ts` (lines 4674-4682)

Called immediately after zoom:
```
1. applyTextFade()                           → Pass 1: counter-scale, semantic zoom tiers
2. cullOverlappingLabels()                   → Pass 2: screen-space collision detection
3. cullOverlappingRotatedLabels (sunburst/grid)
```

---

## 2. Counter-Scale Formula & Semantic Zoom Tiers

### applyTextFade Function
**File**: `src/views/GraphViewContainer.ts` (lines 4447-4671)

#### 2a. Counter-Scale Computation (Lines 4467-4470)

Formula:
```
LABEL_FONT = 11 px (baseline)
rawScale = 1 / zoom^0.4
floorScale = 14 / (11 * zoom)
counterScale = clamp([0.8, 80], max(rawScale, floorScale))

Screen height = 11 * counterScale * zoom ≥ 14px
```

At zoom=0.1:
- rawScale = 1 / 0.1^0.4 = 1 / 0.631 ≈ 1.585× (not 10×)
- floorScale = 14 / (11 * 0.1) = 12.727
- counterScale = min(80, max(0.8, 1.585, 12.727)) = min(80, 12.727) = 12.727
- Screen height = 11 * 12.727 * 0.1 = 14 px ✓

#### 2b. Degree-Based Semantic Zoom Tiers (Lines 4453-4564)

Three zoom thresholds control which nodes get labels based on degree rank:

| Zoom Range | Threshold | Degree Cutoff | Percentile | Behavior |
|---|---|---|---|---|
| **< 0.15** | Tier 1 | `pTier1` | top 10% (scaled) | Extreme zoom-out: only hubs |
| **0.15–0.35** | Tier 2 | `pTier2` | top 30% | Moderate zoom-out |
| **0.35–0.70** | Tier 3 | `pTier3` | top 50% | Zoom-in starting |
| **≥ 0.70** | Default | all | 100% | Fully zoomed in |

**Percentile Computation** (lines 4457-4462):
```typescript
degValues = [sorted degrees, descending]

// Tier 1: proportional tightening at extreme zoom
tier1Ratio = clamp([0.05, 1], zoom / 0.15)
effectivePctTier1 = 0.10 * tier1Ratio
pTier1 = degValues[floor(len * effectivePctTier1)]

// Tiers 2, 3: fixed percentiles
pTier2 = degValues[floor(len * 0.30)]
pTier3 = degValues[floor(len * 0.50)]
```

Example: At zoom=0.075 (halfway between 0 and tier1=0.15):
- tier1Ratio = 0.075 / 0.15 = 0.5
- effectivePctTier1 = 0.10 * 0.5 = 0.05 (top 5%, stricter than 10%)

**Eligibility Logic** (lines 4548-4564):
```
if isSuper → always eligible
else if zoom < 0.4:
  if zoom < 0.15 → eligible = degree ≥ pTier1
  else → eligible = degree ≥ pTier2
else if zoom < 0.35 → eligible = degree ≥ pTier2  [unreachable dead zone]
else if zoom < 0.70 → eligible = degree ≥ pTier3
else → eligible = true (show all)
```

#### 2c. Label Text Truncation at Extreme Zoom (Lines 4484-4523)

At extreme zoom-out (default < 0.1), text is truncated to reduce AABB width:

```
truncateZoom = 0.1
truncateMaxChars = 8
truncateMinChars = 3

effectiveMaxChars = max(3, round(8 * zoom / 0.1))
```

At zoom=0.03: chars = max(3, round(8 * 0.03 / 0.1)) = max(3, 2) = 3 chars (ellipsis added)

#### 2d. Super-Node Diversity Guarantee (AP-5) (Lines 4577-4606)

Prevents culling from monopolizing labels for super nodes. When not enough regular nodes pass semantic zoom:

```
eligibleNonSuper = count of non-super candidates
targetRegulars = max(5, ceil(eligibleSuper * 0.50))

if eligibleNonSuper < targetRegulars:
  promote = top(targetRegulars - eligibleNonSuper) hidden non-super nodes by degree
```

Ensures ≥5 regular (non-super) labels shown even if culling would hide them.

#### 2e. MaxVisible Cap (Lines 4608-4634)

After semantic zoom filtering, caps total visible labels:

```
sort candidates: supers first, then by degree descending
for each candidate:
  if hovered → always show
  if visCount ≥ labelMaxVisible (0=unlimited) → hide
  else → show, visCount++
```

---

## 3. Screen-Space AABB Calculation for Overlap Detection

### cullOverlappingLabels Function
**File**: `src/views/RenderPipeline.ts` (lines 1139-1550)

#### 3a. AABB Computation in Screen Pixels (Lines 1167-1190)

All AABB coordinates are **in screen pixels** (world coordinates × zoom):

```typescript
zoom = worldContainer.scale.x
fontSize = 11  (default)
charWidth = fontSize * 0.6 = 6.6
scaleX, scaleY = label.scale (counter-scale from applyTextFade)
padX, padY = label background padding

rawW = textLength * charW * scaleX * zoom + padX * 2 * scaleX * zoom
rawH = fontSize * scaleY * 1.3 * zoom + padY * 2 * scaleY * zoom

// Cap to prevent enormous AABBs at extreme zoom-out
w = min(rawW, labelOverlapMaxScreenW=500)
h = min(rawH, labelOverlapMaxScreenH=150)

// World position → screen position
screenX = (nodeX + labelX) * zoom
screenY = (nodeY + labelY) * zoom
```

**Key insight**: Because coordinates are in screen pixels, overlap detection is zoom-invariant
and collision-detection margins (12px) don't need zoom conversion.

#### 3b. Interleaving Sort (AP-5 Protection) (Lines 1194-1211)

Supers and regulars are interleaved to ensure label diversity:

```
supers = [super nodes sorted by degree descending]
regulars = [non-super nodes sorted by degree descending]

result = []
loop:
  append 1 super
  append min(5, remaining) regulars
```

This ensures `labelMinNonSuper=5` regular labels always get placement priority.

---

## 4. Collision Detection & Displacement Algorithm

### 4a. Main Pass: 8-Direction Displacement (Lines 1213-1328)

```typescript
margin = 12px (labelOverlapMargin)
placed = [] (successfully placed labels)

for each rect in rects:
  if no overlap with placed:
    placed.push(rect)
  else:
    offsets = [8 cardinal+diagonal directions]
    for offset in offsets:
      // Convert screen-space offset to world space
      worldDx = offset.dx / zoom
      worldDy = offset.dy / zoom

      // AP-1: cap total displacement distance to 4 × normBase
      totalDist = sqrt((baseLx + worldDx)^2 + (baseLy + worldDy)^2)
      if totalDist > maxWorldDisp:
        scale = maxWorldDisp / totalDist
        worldDx, worldDy = rescale

      // Check screen-space overlap with cap
      screenX = (nodeX + baseLx + worldDx) * zoom
      screenY = (nodeY + baseLy + worldDy) * zoom

      if no overlap:
        apply displacement, add to placed
        draw leader line if enabled
        break

    if no offset worked:
      hide label
```

Displacement offsets (in screen pixels):
- Bottom-right: [w/2 + nodeR, nodeR + h]
- Left: [-(w + nodeR + 2), 0]
- Below: [0, nodeR + h*1.2]
- Top-right/left: [±(w + nodeR + 2), -(nodeR + h)]
- Above-right/left: [±(w*0.3 + nodeR), -(nodeR + h*1.2)]

### 4b. Force-Show Guarantee (AP-4, AP-5) (Lines 1330-1542)

After main pass, guarantees minimum visible labels using 80-direction search:

```
minPlaced = 3 (absolute)
minPlacedRatio = 0.18 (18% of candidates)
absoluteFloor = max(minPlaced, ceil(candidates * minPlacedRatio))

// 8 directions × 10 multipliers = 80 positions
for m in 1..10:
  for direction in [right, left, down, up, BR, TL, TR, BL]:
    offset = (direction * (labelWidth + nodeR) * m)
```

**Step 1**: Force-show min(5, 50% of super count) regular labels
**Step 2**: AP-5 concession swap (hide low-degree supers, show regulars)
**Step 3**: Force-show until absoluteFloor reached

---

## 5. Configuration Thresholds Summary

### Semantic Zoom Tiers (RenderThresholds)

| Parameter | Default | Range | Purpose |
|---|---|---|---|
| `labelZoomTier1` | 0.15 | (0, 1) | Zoom below = top 10% degree |
| `labelZoomTier2` | 0.35 | (0, 1) | Zoom below = top 30% degree |
| `labelZoomTier3` | 0.70 | (0, 1) | Zoom below = top 50% degree |
| `labelDegreePctTier1` | 0.10 | (0, 1) | Percentile rank tier 1 |
| `labelDegreePctTier2` | 0.30 | (0, 1) | Percentile rank tier 2 |
| `labelDegreePctTier3` | 0.50 | (0, 1) | Percentile rank tier 3 |
| `nodeLabelZoomMin` | 0.4 | (0, 1) | LOD threshold for tier filtering |

### Counter-Scale Control

| Parameter | Default | Purpose |
|---|---|---|
| `labelMinScreenPx` | 14 | Minimum height on-screen [px] |
| `labelScalePower` | 0.4 | Exponent: counterScale = 1/zoom^power |
| `labelScaleMin` | 0.8 | Minimum counter-scale factor |
| `labelScaleMax` | 80 | Maximum counter-scale factor |
| `labelAlphaMin` | 0.7 | Minimum opacity |

### Overlap Culling Control

| Parameter | Default | Purpose |
|---|---|---|
| `labelOverlapCulling` | true | Enable/disable collision detection |
| `labelOverlapMargin` | 12 | Extra margin around AABB [screen px] |
| `labelOverlapMaxScreenW` | 500 | Cap AABB width [screen px] |
| `labelOverlapMaxScreenH` | 150 | Cap AABB height [screen px] |
| `labelMinNonSuper` | 5 | Min regular labels guaranteed |
| `labelMinPlaced` | 3 | Absolute floor on placed labels |
| `labelMinPlacedRatio` | 0.18 | Ratio floor (18% of candidates) |
| `labelMaxDisplacementRatio` | 4.0 | Max world-space displacement |
| `labelLeaderLines` | true | Draw lines from node to label |

### Text Truncation

| Parameter | Default | Purpose |
|---|---|---|
| `labelTruncateZoom` | 0.1 | Zoom below = truncate text |
| `labelTruncateMaxChars` | 8 | Max chars at truncateZoom |
| `labelTruncateMinChars` | 3 | Min chars at extreme zoom |

### Tag & Group Labels

| Parameter | Default | Purpose |
|---|---|---|
| `tagLabelZoomMin` | 1.2 | Zoom below = hide tag labels |
| `groupLabelScalePower` | 0.45 | Counter-scale power for groups |
| `groupLabelScaleMin` | 0.6 | Min counter-scale for groups |
| `groupLabelScaleMax` | 4.0 | Max counter-scale for groups |
| `groupGridLabelZoomMin` | 0.2 | Zoom below = hide grid labels |

---

## 6. Event Flow Diagram

```
User: Wheel Zoom Event
  ↓
InteractionManager.onWheel() [line 171]
  ├─ world.scale *= 1.1 or 0.9
  ├─ Clamp to [0.02, 10]
  ├─ Marks view dirty
  ├─ IMMEDIATE: updateLabelsForZoom()
  │   ↓
  │   GraphViewContainer.updateLabelsForZoom() [4674]
  │   ├─ applyTextFade() [4447]
  │   │   ├─ Compute: counterScale = 1/zoom^0.4, clamped [0.8, 80]
  │   │   ├─ Compute: degree percentiles pTier1, pTier2, pTier3
  │   │   ├─ For each node:
  │   │   │   ├─ Apply counter-scale to label.scale
  │   │   │   ├─ Truncate text if zoom < 0.1
  │   │   │   ├─ Apply semantic zoom tier eligibility
  │   │   │   └─ Set label.visible, label.alpha
  │   │   ├─ Guarantee minNonSuper diversity (AP-5 pre-pass)
  │   │   └─ Apply maxVisible cap
  │   │
  │   ├─ cullOverlappingLabels() [RenderPipeline:1139]
  │   │   ├─ Compute screen-space AABBs for all visible labels
  │   │   ├─ Interleave supers & regulars by degree
  │   │   ├─ Main pass: 8-offset displacement for each rect
  │   │   │   └─ Draw leader lines for displaced labels
  │   │   ├─ Force-show guarantee:
  │   │   │   ├─ Step 1: min(5, super×0.5) regular labels
  │   │   │   ├─ Step 2: AP-5 concession swap if needed
  │   │   │   └─ Step 3: min(3, 18% of candidates) total
  │   │   └─ Final leader line pass for force-show labels
  │   │
  │   └─ cullOverlappingRotatedLabels() [x3] for sunburst/grid
  │
  ├─ Update zoom indicator UI
  │
  └─ DEBOUNCED (500ms): onZoomLayoutUpdate(zoom) [4686]
      └─ If zoomNodeSizeAdapt enabled:
          └─ Adjust node radius based on zoom
```

---

## 7. Key Files & Line Numbers

| File | Function | Lines | Purpose |
|---|---|---|---|
| `InteractionManager.ts` | onWheel | 171–195 | Zoom event handler |
| `GraphViewContainer.ts` | updateLabelsForZoom | 4674–4682 | Orchestrate label visibility |
| `GraphViewContainer.ts` | applyTextFade | 4447–4671 | Counter-scale, semantic zoom, truncation |
| `RenderPipeline.ts` | cullOverlappingLabels | 1139–1550 | Collision detection & displacement |
| `types.ts` | RenderThresholds (interface) | 883–951 | Configuration schema |
| `types.ts` | DEFAULT_RENDER_THRESHOLDS | 1188–1198 | Default values |
| `EnclosureRenderer.ts` | drawEnclosures | 100–322 | Group label zoom adaptation |

---

## 8. Summary: Core Algorithms

### Counter-Scale: Labels Stay Readable
```
counterScale = clamp(
  [0.8, 80],
  max(
    1 / zoom^0.4,        // Softening exponent
    14 / (11 * zoom)      // Min 14px screen height
  )
)
```

### Semantic Zoom: Progressive Filtering
```
< 0.15  → top 10% (scaled)
0.15-0.35 → top 30%
0.35-0.70 → top 50%
≥ 0.70  → all nodes
```

### Screen-Space AABB: Zoom-Invariant
```
w = min(
  textLen * 6.6 * scaleX * zoom + pad * scaleX * zoom,
  500px
)
h = min(
  11 * scaleY * 1.3 * zoom + pad * scaleY * zoom,
  150px
)
overlap = checkAABB(rect1, rect2, margin=12px)
```

### Collision Resolution: Multi-Stage
```
1. Main pass: 8-direction offsets per label
2. Force-show: guarantee minNonSuper regulars
3. Concession: swap low-degree supers for regulars (AP-5)
4. Absolute floor: guarantee minPlaced total labels
```

---

## 9. Anti-Patterns & Protections

| Code | Name | Guarantee |
|---|---|---|
| **AP-1** | Floating Label | Max displacement: 4 × (radius + visualWidth*0.3) |
| **AP-4** | Unlabelled Graph | Min placed: max(3, 18% of candidates) |
| **AP-5** | Super Monopoly | Min regular labels: max(5, 50% of super count) |
| **AP-6** | Label Ambiguity | Leader lines for force-show displaced labels |
