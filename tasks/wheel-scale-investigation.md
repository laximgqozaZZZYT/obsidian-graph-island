# Wheel handler / scale assignment — Investigation Report

Task: `scripts/pipeline/tasks/487-479-wheel-scale-grep.md`
Parent: `479-475-wheel-handler-scale`
Date: 2026-04-17

## TL;DR

**The refactor the parent task envisions has already been completed.**
`src/views/GraphViewContainer.ts` contains **no** wheel handler and **no** direct scale/zoom mutation. The wheel handler was extracted to `src/views/InteractionManager.ts` (parent task 473, status: done) and already calls `computeZoomStep` — the pure function target of the parent task.

Parent task `479-475-wheel-handler-scale` is a no-op and can be closed.

## Grep results

### GraphViewContainer.ts

| Pattern | Matches |
|---|---|
| `wheel` | 0 |
| `deltaY` | 0 |
| `addEventListener.*wheel` | 0 |
| `registerDomEvent.*wheel` | 0 |

The parent task's assumption — that GraphViewContainer.ts hosts the wheel handler and mutates scale inline — is stale.

### InteractionManager.ts (actual host of the wheel handler)

| Line | Role |
|---|---|
| 198–204 | Zoom constants: `ZOOM_IN_FACTOR = 1.1`, `ZOOM_OUT_FACTOR = 0.9`, `ZOOM_SCALE_MIN = 0.02`, `ZOOM_SCALE_MAX = 10` |
| 214–218 | `computeZoomFactor(deltaY, sensitivity)` — pure factor calculation |
| 224–226 | `clampScale(scale)` — pure clamp |
| 237–243 | `computeZoomStep(currentScale, deltaY, sensitivity)` — composed pure function |
| 346, 352 | Listener wiring: `canvas.addEventListener("wheel", this._onWheel, { passive: false })` |
| 372 | Listener removal in `detach()` |

## Handler position

- **File**: `src/views/InteractionManager.ts`
- **Handler**: `handleWheel(e: WheelEvent)`
- **Range**: `src/views/InteractionManager.ts:396-411`

## Current scale-update expression (excerpt)

```ts
// InteractionManager.ts:396-411
private handleWheel(e: WheelEvent) {
    e.preventDefault();
    const app = this.host.getPixiApp();
    if (!app) return;

    const sens = this.host.getZoomSensitivity?.() ?? 1.0;
    const rect = this.canvas.getBoundingClientRect();
    this._smoothZoomCursorX = e.clientX - rect.left;
    this._smoothZoomCursorY = e.clientY - rect.top;

    this._targetScale = computeZoomStep(this._targetScale, e.deltaY, sens);

    if (!this._smoothZoomId) {
        this._smoothZoomId = requestAnimationFrame(() => this.smoothZoomTick());
    }
}
```

The handler itself does **not** touch `world.scale` directly. It only updates `this._targetScale` via `computeZoomStep`, then schedules `smoothZoomTick` via rAF.

## Existing clamp

Clamping is already handled inside `computeZoomStep` via `clampScale`:

```ts
// InteractionManager.ts:224-226
export function clampScale(scale: number): number {
    return Math.max(ZOOM_SCALE_MIN, Math.min(ZOOM_SCALE_MAX, scale));
}

// InteractionManager.ts:237-243
export function computeZoomStep(
    currentScale: number,
    deltaY: number,
    sensitivity = 1.0,
): number {
    return clampScale(currentScale * computeZoomFactor(deltaY, sensitivity));
}
```

Clamp is re-applied inside `smoothZoomTick` (line 427) on each frame:

```ts
const next = clampScale(current + diff * SMOOTH_ZOOM_LERP);
```

No use of `RenderThresholds.MIN_ZOOM` / `MAX_ZOOM` — the clamp lives as module-level constants in InteractionManager.

## Side-effects to watch when (if) touching this code

Although the `computeZoomStep` migration is already done, any further refactor of the wheel path must preserve these interactions in `smoothZoomTick` (`InteractionManager.ts:413-438`):

1. **Cursor-anchored zoom compensation** — `world.toLocal({x: mx, y: my})` → set scale → `world.toGlobal(worldPos)` → translate by `(mx - newScreenPos.x, my - newScreenPos.y)`. Without this, zooming happens around world origin instead of cursor.
2. **Smooth zoom lerp** — `next = current + diff * SMOOTH_ZOOM_LERP` with an rAF loop gated by `SMOOTH_ZOOM_EPSILON`. Replacing with immediate assignment would lose the smoothing.
3. **`afterZoomStep` side-effects** (`InteractionManager.ts:440-455`):
   - `host.markDirty()` — schedules a repaint.
   - `updateLabelsForZoom` — debounced label re-cull (50 ms).
   - `updateZoomIndicator(s)` — HUD percentage.
   - `onZoomLayoutUpdate(s)` — debounced (400 ms) full layout recalc, only fired when `|Δz|/z ≥ 0.2`.
4. **Sensitivity source** — `host.getZoomSensitivity?.() ?? 1.0`; tied to the `IL: Zoom wheel sensitivity multiplier` setting.
5. **`passive: false`** — required for `e.preventDefault()` on wheel; removing it would break browser scroll suppression.
6. **`_targetScale` vs `world.scale.x`** — these diverge during smoothing; anything reading "current zoom" must pick the right one (target for UI that should reflect the final value, `world.scale.x` for per-frame math).

## Recommendation for parent task 479-475

Close as **already-done**. The refactor goal (wheel handler uses `computeZoomStep`) is satisfied:

- `InteractionManager.ts:406` invokes `computeZoomStep(this._targetScale, e.deltaY, sens)`.
- No residual inline scale math remains in any wheel handler.
- GraphViewContainer.ts has no wheel-related code at all.

Remaining scope worth considering (but out of the current subtask):
- Export/rename `ZOOM_SCALE_MIN/MAX` into `RenderThresholds` if the project wants a single threshold table (the CLAUDE.md "Forbidden Patterns" lists "Bypassing `RenderThresholds` with inline numeric assignments"). Currently these constants live only in InteractionManager.
- Unit tests for `computeZoomStep` / `clampScale` / `computeZoomFactor` — check `tests/views/InteractionManager.test.ts` (if it exists) before adding.
