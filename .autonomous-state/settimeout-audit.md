# setTimeout / clearTimeout Audit (subtask of 1491-settimeout-leaks)

**Generated**: 2026-04-28
**Scope**: `src/**/*.ts` only (excludes `tests/`, `e2e/`)
**Method**: `Grep "setTimeout"` / `Grep "clearTimeout"` followed by per-site read of:
  - whether the timer handle is captured in a variable / field
  - whether that handle is `clearTimeout`-ed in a teardown path
    (`onClose`, `detach`, `destroy`, `cancel`, `clearAll`, etc.)

This subtask is **audit-only** — no code changes. Subsequent subtasks of
`1491-settimeout-leaks` will pick fixes from this list.

---

## Summary

- Raw `setTimeout` references in `src/`: **43** (mix of code, comments, type defs)
- Raw `clearTimeout` references in `src/`: **25**
- Actual `setTimeout(...)` *call-sites*: **~30** (excluding type defs / comments)
- Properly cleaned-up sites (have a teardown clearTimeout path): **~14**
- **Unclean / uncertain sites**: **19** (listed below)

### Existing managed primitives (safe — auto-cleared)

These wrap `setTimeout` and are released by `clearAll()` on teardown,
so call-sites going through them are **not** considered leaks here:

| Primitive | File | Released by |
|---|---|---|
| `ManagedTimers` | `src/utils/managed-timers.ts` | `clearAll()` |
| `TimerRegistry` | `src/utils/timer-registry.ts` | `clearAll()` |

`GraphViewContainer.timers` is a `ManagedTimers` instance and is released
in `onClose()` at `src/views/GraphViewContainer.ts:1685` — every call going
through `this.timers.setTimeout(...)` or `ctx.timers.setTimeout(...)` is
therefore safe.

### Properly cleaned-up `window.setTimeout` fields (verified)

| File:Line | Field | Cleared in |
|---|---|---|
| `src/views/GraphViewContainer.ts:633` | `_saveTimer` | `onClose` (line 1683) |
| `src/views/GraphViewContainer.ts:6929` | `_doRenderDebounceTimer` | `onClose` (line 1682) |
| `src/views/GraphViewContainer.ts:2207` | `_hoverPreviewTimer` | `_cancelHoverPreview()` (line 2214) → called from `onClose` (line 1687) |
| `src/views/GraphViewContainer.ts:7582` | `_autoFitTimer` | `onClose` (line 1681) |
| `src/views/InteractionManager.ts:447` | `_zoomCullTimer` | `detach()` (line 372) + `afterZoomStep` (line 446) |
| `src/views/InteractionManager.ts:454` | `_zoomLayoutTimer` | `detach()` (line 371) + `afterZoomStep` (line 453) |
| `src/views/RenderPipeline.ts:1845` | `deferredBatchId` | `cancelDeferredBatch()` (line 1850); called from `detach()` (line 620) and `createPixiNodes` (line 1433) |

---

## Uncleaned / unsafe `setTimeout` call-sites

Format: `file:line — purpose [risk-tier]`

Risk tiers:
- **HIGH** — fires after view teardown and touches view-owned state (callbacks/host refs/DOM that may be detached)
- **MED** — fires after teardown but only mutates short-lived DOM that is already removed; observable side-effects rare but possible
- **LOW** — fires after teardown but body is trivially safe (no host access, DOM lookups already null-checked)

### HIGH

1. `src/views/GraphViewContainer.ts:1438` — auto-snapshot debounce timer hooks
   (`{ setTimeout: window.setTimeout, clearTimeout: window.clearTimeout }`)
   passed to `createAutoSnapshotHandler`. The returned `autoSnap.cancel()` is
   **never called** — `autoSnap` is local to the `if` block at lines
   ~1422–1442 and `onClose` (line 1680) cannot reach it. Pending snapshot
   timer can fire after view close and call `host.persist(...)`.

2. `src/views/RenderPipeline.ts:1786` — `setTimeout(() => this.enrichLabelsDeferred(), 2500)`
   inside `processDeferredBatch`. Handle not stored. `RenderPipeline.detach()`
   (line 619) only calls `cancelDeferredBatch()` which clears `deferredBatchId`,
   not this enrichment kick-off. After view close, this still fires and runs
   `enrichLabelsDeferred()` against a torn-down host.

3. `src/views/RenderPipeline.ts:1828` and `src/views/RenderPipeline.ts:1834` —
   `this._enrichmentCancelId = setTimeout(processNext, 0)` chunked label
   enrichment. `_enrichmentCancelId` is captured but **never cleared in
   `detach()`**. The internal `clearTimeout` at line 1800 only fires when
   `enrichLabelsDeferred()` is *re-entered*, not on teardown. Each pending
   chunk after teardown calls `this.host.getPixiNodes()` / `getDegrees()` etc.

4. `src/views/RenderPipeline.ts:1488` — `setTimeout(() => this.host.onAllPixiNodesCreated?.(), 0)`
   in the sync-path branch of `createPixiNodes`. Handle not stored. Fires the
   tick after teardown and calls a host callback that triggers force /
   simulation work.

5. `src/views/panel-callbacks.ts:113` — `setTimeout(() => host.renderPipeline?.forceRender(), 100)`
   inside `markDirty()`. Handle not stored. Fires after teardown and triggers
   a render on a detached pipeline (the `?.` saves the immediate crash but
   the call is still wasted work and racey with `detach()`).

### MED

6. `src/views/InteractionManager.ts:1055` — `setTimeout(...)` 300 ms inside
   the "search in vault" context-menu handler. Captures `obsApp.workspace`
   and indirectly `node`. Handle not stored. If user closes the graph view
   between right-click→search and 300 ms later, the workspace-search query
   still fires (but on a different leaf, mostly harmless).

7. `src/views/PanelBuilder.ts:1385` — `setTimeout(() => cb.setZoom?.(panel.presetZoomLevel), 500)`
   in preset import. Handle not stored. View can close in the 500 ms window;
   `cb.setZoom?.` is null-tolerant but still references panel state.

8. `src/views/panel-sections-layout.ts:390` — same pattern as above
   (`setTimeout(() => cb.setZoom?.(panel.presetZoomLevel), 500)` after sample
   preset load). Handle not stored.

9. `src/views/coord-panel.ts:444` — `setTimeout(...)` after auto-optimize
   click; delay = `rt.autoOptMaxPasses * 1500 + 500` ms (potentially 10+ s).
   Handle not stored. Re-enables a button reference (`optBtn`) that may have
   been removed when the panel rebuilt or the view closed.

10. `src/views/PanelBuilder.ts:808 / 813` — `searchDebounce` is a
    `let`-scoped local in the search-bar input handler. Internal
    `clearTimeout(searchDebounce)` at line 812 handles re-entry, but
    nothing clears it on view close. Fires `cb.invalidateDataKeepPanel()`
    against a detached view.

11. `src/views/panel-sections-layout.ts:236 / 242` — `debounceTimer` for
    ontology rule save. `let`-scoped. Same pattern: re-entry clears prior
    timer, teardown does not. Fires `cb.invalidateDataKeepPanel()` 2 s late.

12. `src/views/panel-sections-layout.ts:672 / 675` — `spacingDebounce`
    (`let`-scoped). Fires `cb.applyClusterForce(false)` +
    `cb.restartSimulation(0.5)`. No teardown clear.

13. `src/views/panel-sections-layout.ts:779 / 782` — `forceDebounce`
    (`let`-scoped). Fires `cb.updateForces()` + `cb.restartSimulation(0.3)`.
    No teardown clear.

### LOW

14. `src/views/coord-panel.ts:426` — 600 ms color-reset on a `nameEl` that
    is part of the panel DOM. If the panel rebuilds the element is replaced,
    but the closure holds a reference; the assignment to `style.color` on
    a detached node is harmless.

15. `src/views/panel-widgets.ts:209` — 150 ms `popup.style.display = "none"`
    on blur. If the panel was rebuilt the popup is already detached;
    setting `display` on it is a no-op.

16. `src/views/panel-widgets.ts:862` — 150 ms query-hint dismiss on blur.
    `dismissHint()` is null-safe; runs against a detached DOM tree.

17. `src/views/panel-widgets.ts:1069` — same as above (autocomplete dismiss).

18. `src/views/panel-widgets.ts:1226` — 50 ms `setTimeout(ctx.rebuild, 50)`
    on input. `ctx.rebuild` reads from caller-owned closures; rebuild on a
    detached input field is a no-op.

19. `src/views/panel-widgets.ts:1260` — 200 ms `setTimeout(ctx.dismiss, 200)`
    on blur. Same as above.

---

## Recommended fix priorities (for follow-up subtasks)

Pri 1 (HIGH-tier; reduces real leaks of work and host access):

- **GVC:1438** — store `autoSnap` on `this`, call `this.autoSnap?.cancel()`
  in `onClose`. Or pass `this.timers` as the timer hooks so the existing
  `clearAll()` covers it.
- **RenderPipeline:1786 / 1828 / 1834 / 1488** — store handles on
  `RenderPipeline` and clear them all in `detach()` (extending
  `cancelDeferredBatch()` to also clear `_enrichmentCancelId` and the
  enrich-kickoff handle).
- **panel-callbacks:113** — capture handle and clear on view detach
  (route through `host.timers.setTimeout`).

Pri 2 (MED-tier; mostly UX-correctness):

- **PanelBuilder:1385**, **panel-sections-layout:390**, **coord-panel:444** —
  route through `ctx.timers.setTimeout` (already available — see
  `PanelBuilder.ts:840` for pattern).
- **PanelBuilder:808**, **panel-sections-layout:236 / 672 / 779** —
  same: route debounce timers through `ctx.timers`.
- **InteractionManager:1055** — capture handle, clear in `detach()`.

Pri 3 (LOW-tier; cosmetic):

- `panel-widgets.ts` blur/input handlers (5 sites) — convert to
  `ctx.timers.setTimeout` if a `ctx` is available, otherwise leave as-is.
- `coord-panel.ts:426` — same.

---

## Reference: `clearTimeout` call sites for cross-check

| File:Line | Clears |
|---|---|
| `src/utils/timer-registry.ts:24, 30` | own registry |
| `src/utils/managed-timers.ts:48, 58` | own map |
| `src/views/InteractionManager.ts:371, 372, 446, 453` | `_zoomLayoutTimer`, `_zoomCullTimer` |
| `src/views/panel-sections-layout.ts:241, 674, 781` | local debounce vars (re-entry only) |
| `src/views/RenderPipeline.ts:1800, 1850` | `_enrichmentCancelId` (re-entry), `deferredBatchId` |
| `src/views/snapshot/GraphSnapshot.ts:162, 174` | autoSnap timer (only if `cancel()` is called — see HIGH#1) |
| `src/views/GraphViewContainer.ts:632, 1681, 1682, 1683, 2214, 6928, 6933, 7581` | own fields (all reachable from `onClose`) |
| `src/views/PanelBuilder.ts:812` | `searchDebounce` (re-entry only) |
