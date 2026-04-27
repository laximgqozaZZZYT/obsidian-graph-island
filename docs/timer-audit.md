# Timer Audit — `setTimeout` / `clearTimeout` Leak Survey

Subtask of `1439-settimeout-leaks`. Read-only audit — **no code changes**.

Methodology: `grep -rn "setTimeout(" src/` and `grep -rn "clearTimeout(" src/`.
Each call site is classified into one of three buckets:

- **A** — fire-and-forget, no clear needed (short delay, side-effect is no-op on torn-down DOM, or callback is `?.`-guarded).
- **B** — handle stored AND cleared from a destroy / onunload / onClose / detach path.
- **C** — **未クリア候補**: handle not stored, OR stored but no clear path from teardown.

Comment-only matches and the timer-tracker's own internal `setTimeout` calls are listed separately (infrastructure).

---

## Existing timer-tracker (re-use target)

Two utilities already exist; both were introduced/finished in commit
`5ef6863a chore: done 1435-1434-timer-tracker-settimeout`.

| File | Class | API | Teardown |
|------|-------|-----|----------|
| `src/utils/managed-timers.ts` | `ManagedTimers` | `setTimeout(fn,ms)` / `setInterval(fn,ms)` / `clear(handle)` / `clearAll()` | auto-untracks on fire (timeouts only) |
| `src/utils/timer-registry.ts` | `TimerRegistry` | `set(handler,ms)` / `clear(id)` / `clearAll()` | auto-untracks on fire |

Live consumers of `ManagedTimers`:

| Owner | Field | Teardown clear |
|-------|-------|----------------|
| `GraphViewsPlugin` (main) | `private timers` (main.ts:17) | `this.timers.clearAll()` in `onunload()` (main.ts:241) |
| `GraphViewContainer` | `timers` (GVC:617) | `this.timers.clearAll()` in `onClose()` (GVC:1685) |

`TimerRegistry` is implemented but appears to have **no live consumer** in `src/`
(grep finds only the class definition). The `ManagedTimers` API is the more
expressive of the two (handles intervals as well, types the handle directly)
and is already adopted by both lifecycle owners — **adopt `ManagedTimers` for
remaining migrations**. `TimerRegistry` should either be removed or
documented as deprecated.

---

## Summary

Raw grep matches: **43** for `setTimeout(`.
After excluding 3 comment-only lines and 3 timer-tracker infrastructure lines,
true call sites: **37**.

| Bucket | Count |
|--------|-------|
| A — clear-not-required | 11 |
| B — properly cleared on teardown | 16 |
| **C — leak candidates** | **10** |

---

## C — Leak candidates (10 sites)

Ordered by risk (descending). "Risk" considers: delay length, presence of
optional-chaining guards on the callback, and whether the callback mutates
host state vs only DOM.

| # | File:Line | Delay | Stored? | Why C | Risk |
|---|-----------|-------|---------|-------|------|
| 1 | `src/views/snapshot/GraphSnapshot.ts:163` | up to 5 min (autoSnapshotIntervalMin × 60s) | `let timer = 0` (closure) | `createAutoSnapshotHandler` returns `cancel()` but `GraphViewContainer.onClose()` never invokes it; the closure is owned by the auto-snap handler created at GVC:1418, registered as a metadata-cache event listener at GVC:1442, and never torn down. After view close the debounced `await host.persist(...)` will still fire, calling `host.persist` on a stale closure. | **High** |
| 2 | `src/views/GraphViewContainer.ts:1438` | (forwarder) | n/a | Raw `window.setTimeout` is supplied as the `timers.setTimeout` API to `createAutoSnapshotHandler`. This is the lower-level cause of leak #1: the registered timer is not enrolled in `this.timers` (ManagedTimers) so `clearAll()` cannot reach it. | **High** |
| 3 | `src/views/RenderPipeline.ts:1786` | 2500 ms | not stored | `setTimeout(() => this.enrichLabelsDeferred(), 2500)` runs after the initial population. `RenderPipeline.detach()` (line 619) only clears `deferredBatchId` and never cancels this label-enrichment kickoff; a view closed mid-population will still trigger `enrichLabelsDeferred`, which mutates `pendingLabelThreshold`, reads `host.getPixiNodes()`, and recursively re-schedules itself. | **High** |
| 4 | `src/views/RenderPipeline.ts:1828` | 0 ms (recursive) | `this._enrichmentCancelId` | Stored, but `_enrichmentCancelId` is **only** cleared on the next `enrichLabelsDeferred()` re-entry (line 1800). `RenderPipeline.detach()` does not clear it, so the recursive enrichment chain (~80 nodes/macrotask) keeps running until exhaustion on a detached pipeline. | **High** |
| 5 | `src/views/RenderPipeline.ts:1834` | 0 ms (kickoff) | `this._enrichmentCancelId` | Same as #4 — the kickoff line of the same chain. Listed separately because it is the entry point for any external trigger of `enrichLabelsDeferred()`. | **High** |
| 6 | `src/views/panel-sections-layout.ts:242` | 2000 ms | `let debounceTimer` (closure) | Cleared at the start of every `save()` (line 241) but no clear from view destroy. Callback is `cb.invalidateDataKeepPanel()` — heavyweight; firing on a torn-down panel will throw or silently rebuild detached state. | Medium |
| 7 | `src/views/panel-sections-layout.ts:675` | 100 ms | `let spacingDebounce` (closure) | Same pattern as #6. Callback fires `cb.applyClusterForce(false)` + `cb.restartSimulation(0.5)`. Window is short but during slider-drag → close, very reachable. | Medium |
| 8 | `src/views/panel-sections-layout.ts:782` | 150 ms | `let forceDebounce` (closure) | Same pattern as #6. Callback fires `cb.updateForces()` + `cb.restartSimulation(0.3)`. | Medium |
| 9 | `src/views/PanelBuilder.ts:813` | 400 ms | `let searchDebounce` (closure) | Cleared at line 812 on each input event but no clear from view destroy. Callback runs `pushHistory`, `cb.invalidateDataKeepPanel()`, schedules a `requestAnimationFrame` that touches `searchCountBadge`. | Medium |
| 10 | `src/views/coord-panel.ts:444` | `autoOptMaxPasses * 1500 + 500` ms (≈ 6.5–95.5 s) | not stored | Long delay, fire-and-forget `optBtn.disabled = false`. DOM-only side effect, but the long window means almost every view-close during auto-opt leaks this timer. | Low (DOM-only) |

### Recommended remediation

All 10 sites can be fixed by routing through the existing `ManagedTimers`
instance owned by the closest lifecycle host:

- Sites #1, #2: pass `this.timers` (the GVC-level `ManagedTimers`) into
  `createAutoSnapshotHandler` instead of a raw `{ setTimeout, clearTimeout }`
  shim, OR add `autoSnap.cancel()` to `onClose()` and capture the handler
  on `this`.
- Sites #3, #4, #5: extend `RenderPipeline.detach()` to clear
  `_enrichmentCancelId` and to track the standalone 2500-ms enrichment kickoff
  via a new private field. (Or pass GVC's `timers` into RenderPipeline.)
- Sites #6–#9: replace closure-local `let *Debounce` with calls into the
  surrounding component's `ctx.timers` (panel-builder context already
  exposes `timers` per `PanelBuilder.ts:840`, `1330`, `1346`).
- Site #10: route through `this.timers` from the panel host that owns
  `optBtn`.

---

## B — Properly cleared on teardown (16 sites)

| # | File:Line | Owner | Storage | Clear path |
|---|-----------|-------|---------|-----------|
| 1 | `src/main.ts:372` | `GraphViewsPlugin` | `this.timers` (ManagedTimers) | `this.timers.clearAll()` in `onunload()` (main.ts:241) |
| 2 | `src/views/GraphViewContainer.ts:621` | `GraphViewContainer` | `this.timers` (in `_scheduleTimer`) | `this.timers.clearAll()` in `onClose()` (GVC:1685) |
| 3 | `src/views/GraphViewContainer.ts:633` | `GraphViewContainer` | `this._saveTimer` | `clearTimeout(this._saveTimer)` at GVC:632, GVC:1683 |
| 4 | `src/views/GraphViewContainer.ts:2207` | `GraphViewContainer` | `this._hoverPreviewTimer` | `_cancelHoverPreview()` at GVC:1687 (called from `onClose`) |
| 5 | `src/views/GraphViewContainer.ts:6929` | `GraphViewContainer` | `this._doRenderDebounceTimer` | `clearTimeout(this._doRenderDebounceTimer)` at GVC:1682 |
| 6 | `src/views/GraphViewContainer.ts:7321` (PHASE B) | `GraphViewContainer` | `this.timers` | `this.timers.clearAll()` at GVC:1685 |
| 7 | `src/views/GraphViewContainer.ts:7342` (PHASE C) | `GraphViewContainer` | `this.timers` | `this.timers.clearAll()` at GVC:1685 |
| 8 | `src/views/GraphViewContainer.ts:7371` (PHASE D) | `GraphViewContainer` | `this.timers` | `this.timers.clearAll()` at GVC:1685 |
| 9 | `src/views/GraphViewContainer.ts:7378` (PHASE E) | `GraphViewContainer` | `this.timers` | `this.timers.clearAll()` at GVC:1685 |
| 10 | `src/views/GraphViewContainer.ts:7582` | `GraphViewContainer` | `this._autoFitTimer` | `clearTimeout(this._autoFitTimer)` at GVC:1681, GVC:7581 |
| 11 | `src/views/InteractionManager.ts:447` | `InteractionManager` | `this._zoomCullTimer` | `clearTimeout(this._zoomCullTimer)` at IM:372 (`destroy`) |
| 12 | `src/views/InteractionManager.ts:454` | `InteractionManager` | `this._zoomLayoutTimer` | `clearTimeout(this._zoomLayoutTimer)` at IM:371 (`destroy`) |
| 13 | `src/views/PanelBuilder.ts:840` | panel ctx | `ctx.timers` (= GVC's `ManagedTimers`) | `clearAll()` at GVC:1685 |
| 14 | `src/views/PanelBuilder.ts:1330` | panel ctx | `ctx.timers` | `clearAll()` at GVC:1685 |
| 15 | `src/views/PanelBuilder.ts:1346` | panel ctx | `ctx.timers` | `clearAll()` at GVC:1685 |
| 16 | `src/views/RenderPipeline.ts:1845` | `RenderPipeline` | `this.deferredBatchId` | `cancelDeferredBatch()` at RP:1848, called from `detach()` at RP:620 |

---

## A — Clear-not-required (11 sites)

These call sites do not store the handle, but the callback is provably safe
to fire after teardown (`?.`-guarded, DOM-only no-op on detached element, or
short enough that the host workspace is still alive). Listed for completeness;
no remediation needed unless the callback grows new side effects.

| # | File:Line | Why A |
|---|-----------|-------|
| 1 | `src/views/coord-panel.ts:426` | DOM color reset (`nameEl.style.color = ""`) — no-op on detached element; ~ms delay |
| 2 | `src/views/InteractionManager.ts:1055` | Targets Obsidian's global search leaf, independent of GVC lifecycle |
| 3 | `src/views/panel-widgets.ts:209` | `popup.style.display = "none"` — no-op on detached element |
| 4 | `src/views/panel-widgets.ts:862` | Dismiss query hint; no-op if input element gone |
| 5 | `src/views/panel-widgets.ts:1069` | Dismiss query hint; same as #4 |
| 6 | `src/views/panel-widgets.ts:1226` | `ctx.rebuild` callback at +50 ms; rebuild gated on live container |
| 7 | `src/views/panel-widgets.ts:1260` | `ctx.dismiss` callback; same |
| 8 | `src/views/panel-callbacks.ts:113` | `host.renderPipeline?.forceRender()` — `?.` guarded |
| 9 | `src/views/panel-sections-layout.ts:390` | `cb.setZoom?.(...)` — `?.` guarded |
| 10 | `src/views/PanelBuilder.ts:1385` | `cb.setZoom?.(...)` — `?.` guarded (same idiom as #9) |
| 11 | `src/views/RenderPipeline.ts:1488` | `this.host.onAllPixiNodesCreated?.()` at 0 ms — `?.` guarded, next-tick |

---

## Excluded from the audit (6 grep matches)

### Infrastructure (3)

These are the timer-tracker's own internal calls — the wrappers callers
use to gain leak protection.

- `src/utils/managed-timers.ts:18` — `ManagedTimers.setTimeout` method signature
- `src/utils/managed-timers.ts:23` — `globalThis.setTimeout` inside `ManagedTimers.setTimeout`
- `src/utils/timer-registry.ts:15` — `window.setTimeout` inside `TimerRegistry.set`

### Comment-only matches (3)

- `src/views/GraphViewContainer.ts:7309`
- `src/views/RenderPipeline.ts:1839`
- `src/views/RenderPipeline.ts:1842`
