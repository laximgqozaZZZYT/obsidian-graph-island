# Timer Audit — `setTimeout` in `src/` (2026-04-26)

Parent task: **1284-settimeout-leaks**
Scope: every `setTimeout(` call site under `src/`. No code changes; this file is the audit deliverable only.

## Summary

- **Total `setTimeout(` call sites**: **40**
- **Stored in a field/var** (id-tracked): **17**
- **Cleared in a lifecycle hook** (onClose / detach / cancel*): **9 distinct fields covering 14 sites**
- **Recursive self-loops** (only stoppable via `clearTimeout`): **2** (`RenderPipeline.processDeferredBatch`, `RenderPipeline.enrichLabelsDeferred`)
- **Discarded return value** (cannot be cancelled): **22**

### Risk classes

| Class | Count | Definition |
|------:|:------|:-----------|
| **A — managed** | 14 | id stored AND cleared in close/detach/cancel path |
| **B — debounce-self-cancelling** | 4 | id stored, cleared on every re-trigger, but NO lifecycle clear (timer can fire after view close if no further trigger arrives) |
| **C — fire-and-forget short** | 17 | return discarded, delay ≤ 500 ms, target is local DOM closure (low blast radius but still post-detach hazard) |
| **D — fire-and-forget long** | 3 | return discarded, delay ≥ 600 ms (blast radius high — likely fires after view close) |
| **E — recursive self-loop** | 2 | only stoppable via `clearTimeout`; one of them (`_enrichmentCancelId`) is **NOT** cleared in `RenderPipeline.detach()` |

---

## Full table

Legend
- **stored?** = return value held in a variable/field
- **cleared?** = `clearTimeout` called in onunload/detach/close/destroy/cancel path
- **recursive?** = the callback re-schedules itself with `setTimeout`
- **risk** = A / B / C / D / E from above

| # | file:line | Purpose | delay | stored? | cleared? | recursive? | risk | Recommended action |
|--:|:----------|:--------|------:|:-------:|:--------:|:----------:|:----:|:-------------------|
| 1 | `src/main.ts:371` | Configure new graph leaf after `setViewState` (set subgraphNodeIds, doRender) | 100 ms | no | n/a | no | C | Replace with `requestAnimationFrame`, OR use `app.workspace.onLayoutReady` / `setViewState` await + microtask. Long-term: track in plugin onunload Set. |
| 2 | `src/views/coord-panel.ts:426` | Brief 600ms green-flash on cluster name after click | 600 ms | no | n/a | no | D | Acceptable (CSS-only highlight is safer; consider `el.classList.add` + `transitionend`). |
| 3 | `src/views/coord-panel.ts:444` | Re-enable autoOptimize button after `autoOptMaxPasses*1500+500` ms | dyn (≥ 2000) | no | n/a | no | D | Track via `_pendingTimers` Set OR drive from autoOptimize completion event (eliminate timer entirely). |
| 4 | `src/views/panel-callbacks.ts:113` | Defer `forceRender()` 100 ms after `markDirty` | 100 ms | no | n/a | no | C | Push id into a callback-scoped Set or call `forceRender` synchronously. |
| 5 | `src/views/panel-sections-layout.ts:236` | Debounce `invalidateDataKeepPanel` 2 s after ontology rule edit | 2000 ms | yes (`debounceTimer` closure) | only on next edit (no lifecycle clear) | no | B/D | Pass an external owner (e.g. `_pendingTimers`) so onClose can drain. |
| 6 | `src/views/panel-sections-layout.ts:384` | Restore preset zoom 500 ms after sample preset load | 500 ms | no | n/a | no | C | Wrap with `_scheduleTimer` (GVC) when factored back into the view, or call `setZoom` synchronously after `invalidateData`. |
| 7 | `src/views/panel-sections-layout.ts:787` | Debounce `applyClusterForce + restartSimulation` 100 ms (spacing slider) | 100 ms | yes (`spacingDebounce` closure) | only on next slider tick | no | B | Same as #5 — owner-managed cancellation. |
| 8 | `src/views/panel-sections-layout.ts:924` | Debounce `updateForces + restartSimulation` 150 ms (force slider) | 150 ms | yes (`forceDebounce` closure) | only on next slider tick | no | B | Same as #5. |
| 9 | `src/views/RenderPipeline.ts:1422` | Defer `host.onAllPixiNodesCreated()` to next macrotask (sync path) | 0 ms | no | n/a | no | C | Track in pipeline-owned set, drained in `detach()`. |
| 10 | `src/views/RenderPipeline.ts:1675` | Schedule `enrichLabelsDeferred()` 2.5 s after sim settles | 2500 ms | no | n/a | no | D | **HIGH RISK** — view may close in 2.5 s window. Store id in field and clear in `detach()`. |
| 11 | `src/views/RenderPipeline.ts:1717` | Recurse `processNext` 0 ms (label enrichment chunked loop) | 0 ms | yes (`_enrichmentCancelId`) | partially: cleared on re-entry of `enrichLabelsDeferred`, **NOT** cleared in `detach()` | **YES** | E | **HIGH RISK** — `detach()` must call `clearTimeout(this._enrichmentCancelId)` and null it. |
| 12 | `src/views/RenderPipeline.ts:1723` | Initial schedule of `processNext` (entry into enrichment loop) | 0 ms | yes (`_enrichmentCancelId`) | as above (only re-entry) | starts E | E | Same fix as #11 — covered by clearing the field in `detach()`. |
| 13 | `src/views/RenderPipeline.ts:1734` | Schedule `processDeferredBatch` (deferred node-creation chunk loop) | 0 ms | yes (`deferredBatchId`) | yes — `cancelDeferredBatch()` called from `detach()` (line 602) and from `populatePixiNodes` (line 1365) | **YES** (re-schedules itself by re-calling `scheduleDeferredBatch`) | A/E | **OK** — already managed. Keep guard. |
| 14 | `src/views/snapshot/GraphSnapshot.ts:163` | Auto-snapshot debounce (default 5 min) | dyn (≥ 60 000) | yes (`timer` closure inside `createAutoSnapshotHandler`) | yes — `cancel()` exposed; needs caller to invoke it | no | A* | **Verify caller (GVC line 1431) wires `cancel()` into onClose**. Currently no caller invokes `.cancel`. Add explicit `this.registerEvent` / onClose hook. |
| 15 | `src/views/panel-widgets.ts:209` | Hide autocomplete popup 150 ms after `blur` (allow click-through) | 150 ms | no | n/a | no | C | Tolerable (closure on local DOM); could use `pointerdown` capture instead. |
| 16 | `src/views/panel-widgets.ts:862` | Hide query-hint popup 150 ms after blur (re-check active element) | 150 ms | no | n/a | no | C | Same as #15. |
| 17 | `src/views/panel-widgets.ts:1069` | Hide select-hint popup 150 ms after blur | 150 ms | no | n/a | no | C | Same as #15. |
| 18 | `src/views/panel-widgets.ts:1226` | Defer rebuild 50 ms so attachQueryHint runs first (race-fix) | 50 ms | no | n/a | no | C | Same as #15. |
| 19 | `src/views/panel-widgets.ts:1260` | Dismiss search-jump dropdown 200 ms after blur | 200 ms | no | n/a | no | C | Same as #15. |
| 20 | `src/views/InteractionManager.ts:447` | Debounce label re-cull at end of zoom gesture | 50 ms | yes (`_zoomCullTimer`) | yes — `detach()` line 372 | no | A | OK. |
| 21 | `src/views/InteractionManager.ts:454` | Debounce zoom-driven layout update | `ZOOM_LAYOUT_DEBOUNCE_MS` | yes (`_zoomLayoutTimer`) | yes — `detach()` line 371 | no | A | OK. |
| 22 | `src/views/InteractionManager.ts:1055` | Open vault search after `executeCommandById` 300 ms | 300 ms | no | n/a | no | C | Acceptable (action initiated by user click; targets workspace search leaf, not view-local DOM). |
| 23 | `src/views/GraphViewContainer.ts:619` | `_scheduleTimer` helper — wraps user timers and tracks in `_pendingTimers` Set | dyn | yes (Set) | yes — onClose 1688 drains the Set | no | A | OK — this is the canonical mechanism. **Underused**: most direct `setTimeout` calls in this file bypass it. |
| 24 | `src/views/GraphViewContainer.ts:636` | Debounce workspace `requestSaveLayout` (`SAVE_DEBOUNCE_MS`) | const | yes (`_saveTimer`) | yes — onClose 1686 | no | A | OK. |
| 25 | `src/views/GraphViewContainer.ts:1441` | Adapter passed to `createAutoSnapshotHandler` (defines `setTimeout`/`clearTimeout` hooks) | n/a | n/a | n/a | n/a | n/a | Plumbing only — actual timer is row #14. |
| 26 | `src/views/GraphViewContainer.ts:2211` | Schedule hover preview after `HOVER_PREVIEW_DELAY_MS` | const | yes (`_hoverPreviewTimer`) | yes — `_cancelHoverPreview()` from onClose 1691 | no | A | OK. |
| 27 | `src/views/GraphViewContainer.ts:6932` | Re-debounce `doRender` 50 ms when called within 50 ms window | 50 ms | yes (`_doRenderDebounceTimer`) | yes — onClose 1685 | self-rescheduling on reentry | A | OK. |
| 28 | `src/views/GraphViewContainer.ts:7324` | sim-end PHASE B: a11y announce + entropy/stats/thumbnails | 0 ms | no | n/a | no | C | **Wrap with `this._scheduleTimer`** to leverage existing `_pendingTimers` cleanup. |
| 29 | `src/views/GraphViewContainer.ts:7345` | sim-end PHASE C: viewport fit + road network rebuild | 0 ms | no | n/a | no | C | Same as #28. |
| 30 | `src/views/GraphViewContainer.ts:7374` | sim-end PHASE D: heavy label-culling work | 0 ms | no | n/a | no | C | Same as #28. |
| 31 | `src/views/GraphViewContainer.ts:7381` | sim-end PHASE E: auto-focus + position persistence | 0 ms | no | n/a | no | C | Same as #28. |
| 32 | `src/views/GraphViewContainer.ts:7585` | Auto-fit viewport `AUTOFIT_DELAY_MS` after cluster arrangement change | const | yes (`_autoFitTimer`) | yes — onClose 1684 | no | A | OK. |
| 33 | `src/views/PanelBuilder.ts:810` | Search-bar input debounce 400 ms (commits query + invalidateData) | 400 ms | yes (`searchDebounce` closure) | only on next keystroke | no | B/D | Same as #5 — owner-managed cancellation needed. |
| 34 | `src/views/PanelBuilder.ts:837` | Hide search-history dropdown 150 ms after blur | 150 ms | no | n/a | no | C | Tolerable. |
| 35 | `src/views/PanelBuilder.ts:1327` | Restore export-button label "Exported!" → "Export" after 2 s | 2000 ms | no | n/a | no | D | Tolerable but DOM may be detached → no-op. Replace with CSS class + `transitionend`. |
| 36 | `src/views/PanelBuilder.ts:1343` | Restore diff-export-button label after 2 s | 2000 ms | no | n/a | no | D | Same as #35. |
| 37 | `src/views/PanelBuilder.ts:1382` | Restore preset zoom 500 ms after import | 500 ms | no | n/a | no | C | Same as #6 — call `setZoom` synchronously after invalidateData if possible. |
| 38 | _(see comment at `src/views/RenderPipeline.ts:1728`)_ | Doc-comment only, not a call | — | — | — | — | — | n/a |
| 39 | _(see comment at `src/views/RenderPipeline.ts:1731`)_ | Doc-comment only, not a call | — | — | — | — | — | n/a |
| 40 | _(see comment at `src/views/GraphViewContainer.ts:7312`)_ | Doc-comment only, not a call | — | — | — | — | — | n/a |

> Rows 38–40 appear in `grep "setTimeout("` output because the literal substring occurs inside doc-comments / explanatory prose, not as call expressions. They are listed for completeness so that the count matches `grep` output exactly (40), even though only **37** are real call sites.

---

## Top-priority follow-ups for `1284-settimeout-leaks`

Order by leak blast radius:

1. **`RenderPipeline._enrichmentCancelId` (#11, #12)** — recursive chunk loop survives `detach()`. Fix: add `clearTimeout(this._enrichmentCancelId)` + null in `RenderPipeline.detach()`.
2. **`RenderPipeline.ts:1675` (#10)** — bare 2.5 s `setTimeout(..., enrichLabelsDeferred)` is unstoppable. Fix: store id in a field and clear it in `detach()`.
3. **`createAutoSnapshotHandler` (#14)** — `cancel()` is exposed but no caller invokes it. Fix in `GraphViewContainer.ts` near line 1444: capture the handler reference and call `cancel()` from `onClose()` (and/or `this.register(() => autoSnap.cancel())`).
4. **GVC sim-end PHASE B–E (#28–#31)** — 4 sites should use the existing `this._scheduleTimer` helper instead of bare `setTimeout`.
5. **Debounce closures without lifecycle clear (#5, #7, #8, #33)** — accept an owner-Set parameter from the host (GVC) so its `onClose` can drain pending debounces.
6. **Cosmetic 2 s button-text restores (#35, #36)** and **600 ms color flash (#2)** — replace with CSS-only state transitions to eliminate the timer entirely.

The remaining bare `setTimeout` calls (panel-widgets blur handlers, etc.) are low-risk because they target DOM nodes that are removed when the panel closes; the callback then no-ops. They can stay as-is but are good candidates for a future "no bare setTimeout" lint rule.
