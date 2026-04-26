// ---------------------------------------------------------------------------
// i18n migration notes (parent task: 1261-i18n-hardcoded-strings)
// ---------------------------------------------------------------------------
// Investigation-only artifact — DO NOT IMPORT.
//
// Catalogues hardcoded UI strings (placeholder, aria-label, settings titles,
// performance unit labels, dynamic-prefix labels) that are not yet routed
// through `t()` in src/i18n.ts. Each entry is a TODO for the follow-up
// migration subtask: introduce a key, add en/ja translations, replace the
// literal with `t("...")`.
//
// Naming convention follows existing keys in src/i18n.ts:
//   - placeholder hints  → `<context>.placeholder` (matches search.placeholder)
//   - aria-labels        → new `aria.*` namespace (none currently exist)
//   - settings titles    → reuse existing `section.*` / `settings.*` where
//                          possible; otherwise `settings.*Title`
//   - dynamic prefixes   → `<feature>.<role>` (e.g. `legend.filterAria`)
//
// Total candidates: 39 (matches parent task count).
// ---------------------------------------------------------------------------

// === GROUP A: placeholder strings (8) ============================================
// A1  src/settings.ts:239                 "settings/graph-island.json"          → settingsTab.jsonPathPlaceholder
// A2  src/views/panel-widgets.ts:280      "parent, extends..."                  → ontology.forwardPlaceholder
// A3  src/views/panel-widgets.ts:321      "(双方向)"   *** JA leak in en code   → ontology.bidirectionalPlaceholder
// A4  src/views/panel-widgets.ts:321      "child, down..."                      → ontology.reversePlaceholder
// A5  src/views/panel-widgets.ts:506      "tag:?, category:?, folder:?..."     → groupBy.queryPlaceholder
// A6  src/views/panel-widgets.ts:1401     "tag:?, category:?, folder:?..."     → groupBy.queryPlaceholder (reuse A5)
// A7  src/views/panel-widgets.ts:1466     "tag:character, category:*, *"       → gravity.filterPlaceholder
// A8  src/views/panel-widgets.ts:1499     "rad"                                 → gravity.radPlaceholder
// A9  src/views/panel-widgets.ts:1652     "°"                                   → gravity.degPlaceholder
// A10 src/views/panel-widgets.ts:1758     "tag:character, *, degree>5"         → nodeRule.queryPlaceholder

// === GROUP B: aria-label attributes (16) =========================================
// B1  src/views/panel-widgets.ts:281      "Forward relation label"              → aria.ontologyForward
// B2  src/views/panel-widgets.ts:322      "Reverse relation label"              → aria.ontologyReverse
// B3  src/views/panel-widgets.ts:334      "Delete"                              → aria.delete
// B4  src/views/panel-widgets.ts:1467     "Gravity rule filter"                 → aria.gravityFilter
// B5  src/views/panel-widgets.ts:1483     "Gravity direction"                   → aria.gravityDirection
// B6  src/views/panel-widgets.ts:1496     "Gravity custom angle (radians)"      → aria.gravityAngleRad
// B7  src/views/panel-widgets.ts:1587     "Clear color"                         → aria.clearColor
// B8  src/views/panel-widgets.ts:1592     "Enable color override"               → aria.enableColorOverride
// B9  src/views/panel-widgets.ts:1646     "Gravity custom angle (degrees)"      → aria.gravityAngleDeg
// B10 src/views/panel-widgets.ts:1656     "Gravity strength"                    → aria.gravityStrength
// B11 src/views/panel-widgets.ts:1759     "Node rule query"                     → aria.nodeRuleQuery
// B12 src/views/GraphViewContainer.ts:797  "Graph controls"                     → aria.graphControls
// B13 src/views/GraphViewContainer.ts:953  "Graph canvas"                       → aria.graphCanvas
// B14 src/views/GraphViewContainer.ts:977  "Off-screen nodes"                   → aria.offScreenNodes
// B15 src/views/GraphViewContainer.ts:990  "Graph statistics"                   → aria.graphStats
// B16 src/views/GraphViewContainer.ts:1233 "Graph legend"                       → aria.graphLegend
// B17 src/views/GraphViewContainer.ts:1254 "Keyboard shortcuts"                 → aria.keyboardShortcuts
// B18 src/views/GraphViewContainer.ts:1377 "Graph settings"                     → aria.graphSettings

// === GROUP C: dynamic-prefix labels (5) ==========================================
// Pattern: `<EnglishWord>: ${dynamic}` — wrap the prefix only.
// C1  src/views/LegendRenderer.ts:106     `Filter: ${label}`                    → legend.filterAriaPrefix ("Filter: ")
// C2  src/views/LegendRenderer.ts:264     `Toggle: ${rel}`                      → legend.toggleAriaPrefix ("Toggle: ")
// C3  src/views/GraphViewContainer.ts:1322 `Key: ${key}`                        → aria.keyPrefix ("Key: ")
// C4  src/views/DiffOverlay.ts:393        `Added (${n})`                        → diff.added (template "Added ({count})")
// C5  src/views/DiffOverlay.ts:395        `Changed (${n})`                      → diff.changed
// C6  src/views/DiffOverlay.ts:400        `Removed (${n})`                      → diff.removed

// === GROUP D: settings.ts section titles (9) =====================================
// Most map to existing keys — verify before adding new ones.
// D1  src/settings.ts:25   "Metadata Fields"            → reuse settings.metadataFields
// D2  src/settings.ts:33   "Color Field"                → settings.colorFieldTitle (new)
// D3  src/settings.ts:40   "Group Field"                → settings.groupFieldTitle (new)
// D4  src/settings.ts:46   "Enclosure"                  → settings.enclosureTitle (new)
// D5  src/settings.ts:54   "Ontology"                   → reuse section.ontology
// D6  src/settings.ts:72   "Group Presets"              → settings.groupPresetsTitle (new)
// D7  src/settings.ts:87   "Default Cluster Group Rules" → settings.defaultClusterRulesTitle (new)
// D8  src/settings.ts:106  "Directional Gravity"        → settings.directionalGravityTitle (new)
// D9  src/settings.ts:121  "Node Rules"                 → reuse section.nodeRules

// === GROUP E: performance unit labels (1) ========================================
// E1  src/views/GraphViewContainer.ts:2148 `${fps} fps · ${ms}ms`               → perf.fpsMsTemplate ("{fps} fps · {ms}ms")

// === EXCLUSIONS (not i18n-targets, intentionally documented) ======================
// - UI symbols: × (×), ▸/▾, ▼/▶, ✓/✗ (✓/✗), ★, → — not user text
// - Inline CSS strings (panel-sections.ts:935, panel-sections-nodes-tab.ts:380)
// - String(value) / template literals containing only dynamic data
// - HTML role attributes ("button", "main", "dialog", "complementary", "status")
// - Type/relation enum values rendered verbatim (e.g. relBtn.textContent = rule.relation)
// - File paths and identifiers (node.label, node.id, node.filePath)
// - Already wrapped: t(...) call sites confirmed (search.filterHelp, hover.couldNotRead, etc.)

// ---------------------------------------------------------------------------
// Migration order (suggested for follow-up subtask):
//   1. Group D (settings titles) — safest, mostly key reuse, no behavioral change
//   2. Group A (placeholders)    — user-visible, low risk, no layout shift
//   3. Group B (aria-labels)     — accessibility win, requires aria.* namespace
//   4. Group C (dynamic prefixes) — needs `t()` template helper or replace()
//   5. Group E (perf units)      — last; tiny scope, performance overlay only
// ---------------------------------------------------------------------------

export {};
