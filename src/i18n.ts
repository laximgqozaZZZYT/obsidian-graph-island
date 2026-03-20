// ---------------------------------------------------------------------------
// i18n — locale-aware UI strings for Graph Island
// ---------------------------------------------------------------------------
// Obsidian exposes moment.locale() which reflects the user's language setting.
// We detect locale once at module load and provide a simple t(key) function.
// ---------------------------------------------------------------------------

type TranslationMap = Record<string, string>;

// ---------------------------------------------------------------------------
// English translations (default)
// ---------------------------------------------------------------------------
const en: TranslationMap = {
  // --- PanelBuilder: top-level controls ---
  "layout.label": "Layout",
  "layout.force": "Force",
  "layout.arc": "Arc",
  "search.placeholder": "Search… hop:name:2",
  "settingsFilter.placeholder": "Filter settings…",
  "search.jumpHint": "Enter to jump to node",
  "search.filterHelp": "Filter syntax:\n• tag:act — exact tag match\n• tag:act* — prefix match (act, act1, action…)\n• tag:*act* — partial match\n• path:folder* — filter by file path\n• category:note — filter by category\n• key:value — match frontmatter field\n\nCombine with operators:\n• tag:a AND tag:b — both must match\n• tag:a OR tag:b — either matches\n• (tag:a OR tag:b) AND path:x*\n• tag:a NOR tag:b — neither matches\n• tag:a XOR tag:b — exactly one matches\n\nSpecial:\n• hop:name:2 — highlight within N hops",

  // --- PanelBuilder: section titles ---
  "section.filter": "Filter",
  "section.groups": "Groups",
  "section.display": "Display",
  "section.displayNodes": "Nodes",
  "section.displayEdges": "Edges",
  "section.displayGrouping": "Grouping",
  "section.displayOther": "Other",
  "section.nodeRules": "Node Rules",
  "section.relationColors": "Relation Colors",
  "section.clusterArrangement": "Cluster Arrangement",
  "section.graphSync": "Graph Sync",
  "section.pluginSettings": "Plugin Settings",
  "section.ontology": "Ontology",
  "section.customMappings": "Custom Mappings",
  "section.tagRelations": "Tag Relations",
  "tab.filter": "Filter",
  "tab.display": "Display",
  "tab.layout": "Layout",
  "tab.settings": "Settings",
  "layout.type": "Layout Type",

  // --- PanelBuilder: concentric layout ---
  "concentric.showOrbitRings": "Show Orbit Rings",
  "concentric.autoRotate": "Auto Rotate",

  // --- PanelBuilder: filter ---
  "filter.attachments": "Attachments",
  "filter.existingOnly": "Existing Files Only",
  "filter.orphans": "Orphans",
  "filter.orphanClusterField": "Orphan Grouping Field",
  "filter.dataviewQuery": "Dataview filter",
  "filter.dataviewHint": "DQL source (e.g. #tag, \"folder\")",
  "filter.dataviewUnavailable": "Dataview plugin not installed",
  "filter.tagDisplay": "Tag Display",
  "filter.tagDisplay.off": "Hidden",
  "filter.tagDisplay.node": "Node",
  "filter.tagDisplay.enclosure": "Enclosure",

  // --- PanelBuilder: groups ---
  "groups.addGroup": "New Group",
  "groups.expandAll": "Expand All",
  "groups.collapseAll": "Collapse All",

  // --- PanelBuilder: display ---
  "display.arrows": "Arrows",
  "display.nodeColor": "Node Color (Auto)",
  "display.nodeColorMode": "Node Color Mode",
  "display.nodeColor.default": "Default",
  "display.nodeColor.category": "By Category",
  "display.nodeColor.heatmap": "Heatmap",
  "display.nodeColor.community": "Community",
  "desc.nodeColorMode": "How to color nodes: default, category, heatmap, or community (Louvain)",
  "display.edgeColor": "Edge Color (by Relation)",
  "display.fadeEdges": "Edge Fade (by Degree)",
  "display.textFade": "Text Fade Threshold",
  "display.nodeSubLabelFields": "Sub-Label Fields",
  "display.hoverTooltipFields": "Hover Tooltip Fields",
  "display.nodeSize": "Node Size",
  "display.nodeSizeByDegree": "Size by Degree",
  "desc.nodeSizeByDegree": "Scale node radius proportional to connection count",
  "display.hoverHops": "Hover Highlight Hops",
  "display.focusCone": "Focus Cone",
  "display.focusMode": "Focus Mode",
  "display.visualLinkEditor": "Visual Link Editor",
  "display.missingNeighbors": "Highlight Unlinked Same-Tag",
  "display.links": "Links",
  "display.sharedTags": "Shared Tags",
  "display.sharedCategory": "Shared Category",
  "display.semantic": "Semantic (semantic)",
  "display.inheritance": "Inheritance (is-a)",
  "display.aggregation": "Aggregation (has-a)",
  "display.similar": "Similar (similar)",
  "display.sibling": "Sibling (peer)",
  "display.sequence": "Sequence (next/prev)",
  "display.edgeLabelPlacement": "Edge Label Placement",
  "display.edgeLabelCenter": "Center",
  "display.edgeLabelOffset": "Offset",
  "display.edgeLabelSmart": "Smart (avoid overlap)",
  "display.edgeLayerMode": "Layer Separation",
  "display.edgeDirectionFilter": "Edge Direction Filter",
  "display.edgeDirAll": "All",
  "display.edgeDirBidirectional": "Bidirectional Only",
  "display.edgeDirUnidirectional": "Unidirectional Only",
  "display.bidirectionalIndicator": "Bidirectional Indicator",
  "display.showPathfinderOverlay": "Pathfinder Overlay",
  "display.edgeCardinality": "Cardinality Markers",
  "display.cardinalityNone": "None",
  "display.cardinalityCrowsfoot": "Crow's Foot",
  "display.cableBundleMode": "Cable Bundle Mode",
  "display.cableModeAuto": "Auto (clusters)",
  "display.cableModeAlways": "Always",
  "display.cableModeNever": "Never",
  "display.cableTrunkWidth": "Cable Trunk Width",
  "display.cableTrunkAlpha": "Cable Trunk Opacity",
  "display.cableSpacing": "Cable Spacing",
  "display.cableFanWidth": "Fan Wire Width",
  "display.cableFanAlpha": "Fan Wire Opacity",
  "desc.cableBundleMode": "How inter-cluster edges are grouped into cables",
  "section.roadNetwork": "Road Network",
  "display.showRoadNetwork": "Show road network",
  "display.roadRouteEdges": "Route edges on roads",
  "display.roadAlpha": "Road Opacity",
  "display.roadWidth": "Road Width",
  "desc.showRoadNetwork": "Render auto-generated road network overlay",
  "desc.roadRouteEdges": "Route edges along roads instead of straight lines",
  "display.minimap": "Minimap",
  "display.dotGrid": "Background dot grid",
  "display.syncWithEditor": "Sync with Editor",
  "display.edgeWeightThickness": "Edge Weight (thickness)",
  "display.edgeStrengthGlow": "Edge Strength Glow",
  "display.degreeEdgeWidth": "Edge Width by Degree",
  "desc.degreeEdgeWidth": "Scale edge thickness based on connected node degrees",
  "display.localGraphHops": "Local Graph Hops",

  // --- PanelBuilder: rendering thresholds ---
  "section.renderThresholds": "Rendering Thresholds",
  "render.cardTextNodeCount": "Card text limit",
  "render.cardTextNodeCountDesc": "Max node count for rendering card text labels",
  "render.gradientNodeCount": "Gradient limit",
  "render.gradientNodeCountDesc": "Max node count for gradient rendering (higher = more GPU load)",
  "render.glowNodeCount": "Glow limit",
  "render.glowNodeCountDesc": "Max node count for glow halo rendering",
  "render.clusterChargeForce": "Cluster charge",
  "render.clusterChargeForceDesc": "Repulsion strength in cluster simulation (negative = repel)",
  "render.gridLabelOffset": "Grid label offset",
  "render.gridLabelOffsetDesc": "Distance (px) between grid lines and their labels",
  "render.showFpsMonitor": "Show FPS",
  "render.showFpsMonitorDesc": "Show render frames-per-second counter in toolbar",
  "render.highlightDimAlpha": "Highlight Dim Alpha",
  "render.highlightDimAlphaDesc": "Opacity of non-matching edges/nodes during search highlight",
  "render.showRecentVisitHalo": "Recent Visit Halo",
  "render.showRecentVisitHaloDesc": "Show blue halo on recently navigated nodes",

  "display.groupBy": "Group by",
  "display.groupMinSize": "Min group size",
  "display.groupFilter": "Group filter",

  // --- PanelBuilder: node shapes ---
  "display.tagNodeShape": "Tag node shape",
  "display.defaultNodeShape": "Default node shape",
  "shape.circle": "Circle",
  "shape.triangle": "Triangle",
  "shape.diamond": "Diamond",
  "shape.hexagon": "Hexagon",
  "shape.square": "Square",

  // --- PanelBuilder: node rules ---
  "nodeRules.addRule": "Add Rule",
  "nodeRules.spacing": "Spacing",
  "nodeRules.gravity": "Gravity",
  "nodeRules.color": "Color",

  // --- PanelBuilder: gravity coefficients ---
  "gravity.centerGravity": "Center Gravity",
  "gravity.repelMultiplier": "Repel Multiplier",
  "gravity.interGroupAttraction": "Group Attraction",
  "gravity.interGroupAttractionDesc": "Higher values bring groups closer together",
  "gravity.intraGroupDensity": "Group Density",
  "gravity.intraGroupDensityDesc": "Higher values pack nodes more tightly within groups",

  // --- PanelBuilder: relation colors ---
  "relationColors.changeColor": "Click to change color",

  // --- PanelBuilder: cluster arrangement ---
  "cluster.pattern": "Arrangement Pattern",
  "cluster.concentric": "Concentric",
  "cluster.radial": "Radial",
  "cluster.phyllotaxis": "Phyllotaxis",
  "cluster.grid": "Grid",
  "cluster.triangle": "Triangle",
  "cluster.random": "Random",
  "cluster.timeline": "Timeline",
  "cluster.custom": "Custom",
  "coord.transformExprHint": "e.g. COS(tag:?), BIN(degree, 5), ROSE(index)",
  "coord.transformExprHelp": "Source: index, degree, folder, tag:?, hop:name:3\nTransforms: LINEAR, BIN, STACK, GOLDEN, EVEN, DATE_INDEX\nCurves: ARCHIMEDEAN, ROSE, FERMAT, LISSAJOUS, ...\nMath: sin, cos, tan, sqrt, abs, log, exp, floor, ceil, min, max, pow, atan2\nOperators: + - * / % ^ (power)\nVariables: t (0–1), i (index), n (count), v (value)\nConstants: pi, e, tau  |  Greek: π=pi, θ=t, α→a, etc.\nImplicit ×: 2t → 2*t, πr → pi*r\nFormat: FUNC(source, params...) or raw expression",
  "coord.exprLibrary": "Expression Library",
  "coord.libraryHint": "Click to insert into the axis expression",
  "coord.autoOptimize": "Re-adjust",
  "coord.autoOptimizeRunning": "Optimizing...",
  "coord.variableReference": "Variables",
  "cluster.autoFit": "Auto-fit spacing",
  "cluster.nodeSpacing": "Node Spacing (radius×n)",
  "cluster.groupSize": "Group Size",
  "cluster.groupSpacing": "Group Spacing",
  "cluster.groupArrangement": "Group Layout",
  "cluster.groupArrangementAuto": "Auto (from pattern)",
  "cluster.groupArrangementCircle": "Circle",
  "cluster.groupArrangementHorizontal": "Horizontal",
  "cluster.groupArrangementVertical": "Vertical",
  "cluster.groupArrangementConcentric": "Concentric",
  "cluster.groupArrangementGrid": "Grid",
  "cluster.edgeBundleStrength": "Edge Bundle Strength",
  "cluster.groupRulesHeading": "Group Rules",
  "cluster.addGroupRule": "+ Add Group Rule",
  "cluster.gravityRulesHeading": "Directional Gravity Rules",
  "cluster.addGravityRule": "+ Add Gravity Rule",
  "cluster.sortHeading": "Sort Order",
  "cluster.addSortRule": "+ Add Sort Rule",
  "cluster.followsGroupBy": "Follow Grouping",
  "cluster.followsGroupByDesc": "Use groupBy setting for cluster grouping",
  "cluster.usingGroupBy": "Using groupBy setting",

  // --- PanelBuilder: force strength ---
  "force.centerForce": "Center Force",
  "force.repelForce": "Repel Force",
  "force.linkForce": "Link Force",
  "force.linkDistance": "Link Distance",

  // --- PanelBuilder: plugin settings ---
  "settings.metadataFields": "Metadata Fields",
  "settings.colorField": "Color Field",
  "settings.groupField": "Group Field",
  "settings.enclosureMinRatio": "Enclosure Min Ratio",
  "settings.ontologyHeading": "— Ontology —",
  "settings.inheritanceFields": "Forward",
  "settings.aggregationFields": "Forward",
  "settings.reverseInheritanceFields": "Reverse",
  "settings.reverseAggregationFields": "Reverse",
  "settings.similarFields": "Similar Fields",
  "settings.siblingFields": "Sibling Fields",
  "settings.sequenceFields": "Forward",
  "settings.reverseSequenceFields": "Reverse",
  "settings.ontAddRule": "Add Rule",
  "settings.tagHierarchy": "Tag Hierarchy → Inheritance",
  "settings.customMappingsHeading": "— Custom Mappings —",
  "settings.mappingFieldPlaceholder": "field name",
  "settings.mappingType.inheritance": "is-a",
  "settings.mappingType.aggregation": "has-a",
  "settings.mappingType.similar": "similar",
  "settings.mappingType.sibling": "sibling",
  "settings.mappingType.sequence": "sequence",
  "settings.addMapping": "+ Add Mapping",
  "settings.tagRelationsHeading": "— Tag Relations —",
  "settings.tagRelSourcePlaceholder": "source tag",
  "settings.tagRelTargetPlaceholder": "target tag",
  "settings.tagRelType.inheritance": "is-a",
  "settings.tagRelType.aggregation": "has-a",
  "settings.addTagRelation": "+ Add Tag Relation",

  // --- PanelBuilder: empty state ---
  "empty.title": "No nodes to display",
  "empty.hint": "This plugin builds a graph from your vault's notes, links, tags, and frontmatter metadata.",
  "empty.step1": "Create notes with [[links]] between them",
  "empty.step2": "Add tags (#character, #location) or frontmatter fields",
  "empty.step3": "Configure metadata fields in Plugin Settings below",

  // --- PanelBuilder: presets ---
  "preset.simple": "Simple",
  "preset.simpleDesc": "Minimal settings — links only, clean view",
  "preset.analysis": "Analysis",
  "preset.analysisDesc": "All edge types, color by relation, scale by degree",
  "preset.creative": "Creative Writing",
  "preset.creativeDesc": "Tags as enclosures, group by tag, semantic edges",
  "preset.activeFocus": "Active Focus",
  "preset.activeFocusDesc": "Center graph on currently edited file (2-hop neighborhood)",
  "preset.fullAnalysis": "Full Analysis",
  "preset.fullAnalysisDesc": "All features: stats, bridges, entropy, community colors, missing neighbors",

  // --- PanelBuilder: timeline ---
  "timeline.timeKey": "Time Field",
  "timeline.timeKeyHint": "Frontmatter field for time axis (e.g. date, era, turn)",
  "timeline.endKey": "End Time Field",
  "timeline.endKeyHint": "Frontmatter field for duration end (e.g. end-date, end_time)",
  "timeline.showDurationBars": "Show Duration Bars",
  "timeline.showRoutes": "Route Lines",
  "timeline.showTickLabels": "Show Tick Labels",
  "timeline.showTickLabelsDesc": "Display text labels on timeline axis ticks",
  "timeline.orderFields": "Order Fields",
  "timeline.orderFieldsHint": "Comma-separated fields for link-based ordering (next, prev, parent_id, story_order)",
  "timeline.range": "Time Range",
  "coord.system": "Coordinate System",
  "coord.cartesian": "Cartesian (X, Y)",
  "coord.polar": "Polar (r, θ)",
  "coord.perGroup": "Per-group coordinates",
  "coord.range": "range",
  // --- PanelBuilder: axis transform ---
  "transform.linear": "Linear",
  "transform.bin": "Bin",
  "transform.expression": "Expression",
  "transform.curve": "Curve",
  "transform.exprError": "Invalid expression",
  "transform.exprValid": "Valid",
  "curve.archimedean": "Archimedean Spiral",
  "curve.rose": "Rose Curve",

  "coord.constants": "Constants",
  "coord.constantsHint": "Define variables for use in expressions (e.g. k=6 sides, d=0.5 density)",
  "coord.addConstant": "+ Add Constant",
  "coord.systemConstants": "Overlap Control",
  "coord.sysBlend": "snap strength",
  "coord.sysOverlapPad": "group padding",
  "coord.sysMinGap": "min node gap",
  "coord.constantKey": "Name",
  "coord.constantValue": "Value",

  "guide.gridTableMode": "Custom Grid",
  "guide.gridTableModeDesc": "Display custom grid overlay on coordinate layout",
  "guide.gridStyle": "Grid Style",
  "guide.gridStyle.lines": "Lines",
  "guide.gridStyle.table": "Table",
  "guide.gridShowHeaders": "Show Headers",
  "guide.gridShowHeadersDesc": "Show row and column header labels",
  "guide.showAxisTitles": "Show Axis Titles",
  "guide.showAxisTitlesDesc": "Display axis name labels on coordinate grid",
  "guide.gridCellShading": "Cell Shading",
  "guide.gridCellShadingDesc": "Shade cells by node density",
  "guide.labelPlacement": "Label Placement",
  "guide.labelOnLine": "On Line (Tick)",
  "guide.labelBetween": "Between (Title)",

  // --- PanelBuilder: node display mode ---
  "display.nodeDisplayMode": "Display Mode",
  "display.modeNode": "Node (Shape)",
  "display.modeCard": "Card",
  "display.modeDonut": "Donut",
  "display.modeSunburst": "Sunburst Segment",
  "display.cardFields": "Card Fields",
  "display.cardMaxWidth": "Card Width",
  "display.cardShowIcon": "Show Icon",
  "display.cardHeaderStyle": "Card Style",
  "display.cardStylePlain": "Plain",
  "display.cardStyleTable": "Table (ER)",
  "display.donutBreakdown": "Breakdown Field",
  "display.donutInnerRadius": "Inner Radius",

  // --- PanelBuilder: shared presets ---
  "preset.export": "Export Preset",
  "preset.exportDiff": "Export Changes",
  "preset.exportDiffDesc": "Export only settings that differ from defaults",
  "preset.import": "Import Preset",
  "preset.exported": "Preset copied to clipboard",
  "preset.importError": "Invalid preset JSON",
  "preset.importPrompt": "Paste preset JSON below:",

  // --- M1: Thinking Modes ---
  "mode.explore": "Explore",
  "mode.exploreDesc": "Discover connections — active file centered, gap detection, suggestions",
  "mode.analyze": "Analyze",
  "mode.analyzeDesc": "Full structure analysis — stats, bridges, entropy, communities",
  "mode.write": "Write",
  "mode.writeDesc": "Focus on current note — presentation mode, relation drawer, local graph",
  "toast.modeApplied": "Switched to {name} mode",

  // --- Toast notifications ---
  "toast.presetApplied": "Applied preset: {name}",
  "toast.pngExported": "PNG exported",
  "toast.pngFailed": "PNG export failed",
  "toast.copiedToClipboard": "Copied to clipboard",
  "toast.clipboardFailed": "Clipboard copy failed",
  "toast.localGraphOn": "Local: {name} ({hops} hops)",
  "toast.localGraphOff": "Global graph",
  "toast.embedSuccess": "Graph embedded in note",
  "toast.embedFailed": "Graph embed failed",
  "toast.embedNoEditor": "No active editor to embed into",
  "toast.embedNoGraph": "No active graph view",
  "toast.linkCreated": "Link created: {source} → {target}",
  "toast.linkFailed": "Link creation failed",

  // --- PanelBuilder: action buttons ---
  "action.save": "Save Settings",
  "action.reset": "Reset",

  // --- PanelBuilder: help ---
  "help.ariaLabel": "Help",

  // --- PanelBuilder: direction ---

  // --- PanelBuilder: query hint ---
  "query.pathMatch": "Match file path",
  "query.fileMatch": "Match file name",
  "query.tagSearch": "Search tags",
  "query.categoryMatch": "Match category",
  "query.idMatch": "Match node ID",
  "query.isTag": "Tag nodes only",
  "query.hop": "Within N hops from node",
  "query.property": "Match property",
  "query.boolOps": "Combine with boolean ops",
  "query.all": "Match all nodes",
  "query.viewDetails": "View details",
  "query.candidates": "candidates",
  "query.searchOptions": "Search Options",

  // --- PanelBuilder: expression editor ---
  "expr.addCondition": "+ Add Condition",

  // --- PanelBuilder: sort key options ---
  "sort.degree": "Degree",
  "sort.inDegree": "In-Degree",
  "sort.tag": "Tag",
  "sort.category": "Category",
  "sort.label": "Label",
  "sort.importance": "Propagated Importance",
  "sort.asc": "↑ Asc",
  "sort.desc": "↓ Desc",

  // --- PanelBuilder: cluster group options ---
  "clusterGroup.recursive": "Recursive",

  // --- PanelBuilder: gravity direction ---
  "gravDir.none": "None",
  "gravDir.up": "↑ Up",
  "gravDir.down": "↓ Down",
  "gravDir.left": "← Left",
  "gravDir.right": "→ Right",
  "gravDir.custom": "Custom Angle",
  "gravDir.top": "Top",
  "gravDir.bottom": "Bottom",

  // --- NodeDetailView ---
  "detail.holdAriaLabel": "Hold (pin display)",
  "detail.emptyHint": "Hover over a graph node to see details",
  "detail.linkCount": "Links",
  "detail.category": "Category",
  "detail.openFile": "Open File →",
  "detail.preview": "Preview",
  "detail.emptyFile": "(empty file)",
  "detail.noContent": "(no content)",
  "detail.properties": "Properties",
  "detail.linkedNodes": "Linked Nodes",
  "detail.suggestedLinks": "Suggested Links",
  "detail.backlinks": "Backlinks",

  // --- Node Comparison View ---
  "compare.title": "Node Comparison",
  "compare.clear": "Clear",
  "compare.selectHint": "Ctrl+click two nodes on the graph to compare them",
  "compare.sharedNeighbors": "Shared Neighbors",
  "compare.uniqueTo": "Unique to {name}",
  "compare.sharedTags": "Shared Tags",
  "compare.sharedCategories": "Shared Categories",
  "compare.shortestPath": "Shortest Path",
  "compare.noPath": "No path found",
  "compare.hops": "{n} hops",

  // --- Accessibility ---
  "a11y.canvasLabel": "Interactive graph visualization. Use Tab to cycle nodes, +/- to zoom.",

  // --- GraphViewContainer: toolbar ---
  "toolbar.fitAll": "Fit All",
  "toolbar.zoomIn": "Zoom In",
  "toolbar.zoomOut": "Zoom Out",
  "toolbar.marquee": "Marquee Zoom",
  "toolbar.exportPng": "Export as PNG",
  "toolbar.exporting": "Exporting…",
  "toolbar.copyClipboard": "Copy to Clipboard",
  "toolbar.localGraph": "Local Graph",
  "toolbar.graphSettings": "Graph Settings",
  "toolbar.snapshot": "Snapshots",
  "toolbar.embedInNote": "Embed graph in note",

  // --- Snapshot ---
  "snapshot.save": "Save snapshot...",
  "snapshot.delete": "Delete",
  "snapshot.clearDiff": "Clear diff overlay",
  "snapshot.limitReached": "Maximum 10 snapshots. Delete one first.",
  "snapshot.saved": "Snapshot '{name}' saved",
  "snapshot.deleted": "Snapshot '{name}' deleted",
  "snapshot.enterName": "Enter snapshot name",
  "snapshot.enterNotes": "Add notes (optional)",
  "nav.back": "Navigate back",
  "nav.forward": "Navigate forward",
  "display.soloEdgeType": "Solo",
  "desc.soloEdgeType": "Show one edge type at a time (click to cycle)",

  // --- Node decorations (Phase 2) ---
  "section.nodeDecorations": "Node Decorations",
  "display.semanticZoom": "Semantic Zoom",
  "desc.semanticZoom": "Per-node LOD based on screen size (dot → circle → compact card → full card)",
  "display.autoLOD": "Auto LOD",
  "desc.autoLOD": "Automatically adjust detail level based on zoom — compact cards when close, dots when far",
  "display.showTagBadges": "Tag Badges",
  "desc.showTagBadges": "Show colored tag badges on node circumference",
  "display.showImportanceRing": "Importance Ring",
  "desc.showImportanceRing": "Show metric-proportional ring around nodes (cool→warm gradient)",
  "display.importanceMetric": "Metric",
  "desc.importanceMetric": "Choose metric for importance ring",
  "display.metricDegree": "Degree",
  "display.metricBetweenness": "Betweenness",
  "display.metricPagerank": "PageRank",
  "display.showRecencyMarker": "Recency Marker",
  "desc.showRecencyMarker": "Green dot for recently modified, fade for old nodes",
  "display.recencyDays": "Recent days",
  "display.definitionField": "Definition Field",

  // --- Structure analysis (Phase 3) ---
  "section.structureAnalysis": "Structure Analysis",
  "display.clusterLabelDetail": "Cluster Label Detail",
  "desc.clusterLabelDetail": "Level of detail in cluster labels",
  "display.clusterLabelMinimal": "Minimal",
  "display.clusterLabelStandard": "Standard",
  "display.clusterLabelDetailed": "Detailed",
  "display.clusterLabelRich": "Rich (count + tags)",
  "display.gapDetectionMode": "Gap Detection",
  "desc.gapDetectionMode": "Detect gaps in knowledge structure",
  "display.gapWithinTag": "Within Tag",
  "display.gapCrossCluster": "Cross Cluster",
  "display.gapBoth": "Both",
  "display.highlightPatterns": "Highlight Patterns",
  "desc.highlightPatterns": "Highlight articulation points, spokes, and cliques",
  "display.showBridgeNodes": "Bridge Nodes",
  "desc.showBridgeNodes": "Highlight high-betweenness bridge nodes with gold ring",

  // --- ExcaliBrain features (Phase 6) ---
  "display.focusLayout": "Focus Layout",
  "desc.focusLayout": "Ego-centric layout: selected node at center, neighbors arranged by relation type",
  "display.showHierarchyBreadcrumb": "Hierarchy Breadcrumb",
  "desc.showHierarchyBreadcrumb": "Show inheritance path as breadcrumb bar above graph",

  // --- Discovery & insight (Phase 5) ---
  "section.discovery": "Discovery & Insight",
  "toolbar.surprise": "Surprise — show two unrelated nodes",
  "surprise.noMatch": "No suitable pair found — try again",
  "section.surprise": "Surprise Mode",
  "display.surpriseInterval": "Auto Surprise (sec)",
  "desc.surpriseInterval": "Auto-trigger random juxtaposition every N seconds (0 = off)",
  "display.showSimilarSuggestions": "Similar Suggestions",
  "desc.showSimilarSuggestions": "Show similar unlinked notes on hover (Jaccard similarity)",
  "display.showStructureQuestions": "Structure Questions",
  "desc.showStructureQuestions": "Generate questions from graph structure in statistics panel",
  "display.showEntropyOverlay": "Knowledge Entropy",
  "desc.showEntropyOverlay": "Heatmap overlay showing low-density knowledge gaps",
  "display.analysisOverlay": "Analysis Overlay",
  "analysis.off": "Off",
  "analysis.bridges": "Bridge Nodes",
  "analysis.entropy": "Knowledge Entropy",
  "analysis.gaps": "Gap Edges",
  "analysis.missing": "Missing Neighbors",
  "analysis.all": "All",

  // --- Advanced features (Phase 7) ---

  // --- M2: Ego Layout ---
  "cluster.ego": "Ego (Focus Center)",
  "action.applyEgoLayout": "Apply Ego Layout",

  // --- Phase 4: Interaction Enhancements ---
  "display.relationTypePicker": "Relation Type Picker",
  "desc.relationTypePicker": "Right-click edges to assign relation types",
  "display.multiSelect": "Multi-Select",
  "desc.multiSelect": "Shift+click to select multiple nodes for bulk operations",
  "display.inlineEdit": "Inline Edit",
  "desc.inlineEdit": "Double-click to edit frontmatter properties in-place",
  "display.relationDrawer": "Relation Drawer",
  "desc.relationDrawer": "Expanded side panel showing detailed relation information",
  "display.manualClustering": "Manual Clustering",
  "desc.manualClustering": "Drag nodes between groups to reassign clusters",

  // --- Phase 5: Discovery (D5) ---
  "display.clusterCompare": "Cluster Compare",
  "desc.clusterCompare": "Compare two clusters: shared connections, unique members, bridge nodes",

  // --- Phase 6: ExcaliBrain (F2, F5) ---
  "display.inlineOntologyEditor": "Inline Ontology Editor",
  "desc.inlineOntologyEditor": "Assign ontology types via context menu on nodes",
  "display.relationMatrix": "Relation Matrix",
  "desc.relationMatrix": "Show adjacency matrix view of node relationships",

  // --- Phase 7: Advanced (E5) ---
  "display.presentationMode": "Presentation Mode",
  "desc.presentationMode": "Step-through guided tour of graph nodes",
  "action.addWaypoint": "Add Waypoint",
  "action.nextStep": "Next →",
  "action.prevStep": "← Prev",

  // --- Error messages ---
  "error.pixiInitFailed": "Graph rendering failed. Your browser may not support WebGL.",
  "error.graphBuildFailed": "Failed to build graph data. Check console for details.",
  "error.layoutFailed": "Layout computation failed. Try a different layout.",

  // --- Setting descriptions (tooltips) ---
  "desc.existingOnly": "Hide notes without files",
  "desc.orphans": "Show/hide unconnected nodes",
  "desc.textFade": "Zoom level for label fadeout",
  "desc.hoverHops": "Highlight depth on hover",
  "desc.focusCone": "Distance-based fade — closer neighbors stay brighter on hover",
  "desc.focusMode": "Click a node to lock highlight. Escape to clear.",
  "desc.visualLinkEditor": "Alt+drag from a node to create a [[wikilink]] in the source file.",
  "desc.missingNeighbors": "Mark nodes that share a tag but have no direct edge (potential knowledge gaps).",
  "desc.edgeBundleStrength": "0=straight, 1=fully curved",
  "desc.autoFit": "Auto-spacing from node count",
  "desc.fadeEdges": "Fade less-connected edges",
  "desc.enclosureSpacing": "Hull padding",
  "desc.groupMinSize": "Merge groups smaller than this",
  "desc.tagDisplay": "Show tags as individual nodes or enclosure hulls",
  "desc.nodeDisplayMode": "Node visual: dot, card, donut, or ring chart",
  "desc.tagNodeShape": "Shape used for tag-type nodes",
  "desc.defaultNodeShape": "Default shape for regular nodes",
  "desc.edgeCardinality": "Show 1:N / N:M markers on edges",
  "desc.clusterPattern": "Intra-group node arrangement pattern",
  "desc.coordSystem": "Coordinate system for group placement",
  "desc.groupArrangement": "How groups are positioned relative to each other",
  "desc.timelineRange": "Visible time range (% of total)",
  "desc.attachments": "Show/hide image and file attachments",
  "desc.nodeColor": "Color nodes by frontmatter category",
  "desc.arrows": "Show directional arrows on all edges",
  "desc.edgeColor": "Color edges by relation type",
  "desc.edgeLayerMode": "Draw edge types in separate z-order layers",
  "desc.edgeDirectionFilter": "Filter edges by directionality (A→B vs A↔B)",
  "desc.bidirectionalIndicator": "Visually distinguish bidirectional edges (thicker line)",
  "desc.showPathfinderOverlay": "Show cyan glow overlay on BFS shortest path between selected nodes",
  "desc.links": "Show/hide wikilink edges",
  "desc.sharedTags": "Show edges between notes sharing tags",
  "desc.sharedCategory": "Show edges between notes in same category",
  "desc.semantic": "Show AI-detected semantic similarity edges",
  "desc.inheritance": "Show is-a (parent-child) edges",
  "desc.aggregation": "Show has-a (composition) edges",
  "desc.similar": "Show similar-content edges",
  "desc.sibling": "Show sibling (peer) edges",
  "desc.sequence": "Show next/prev sequential edges",
  "desc.minimap": "Show navigation minimap overlay",
  "desc.dotGrid": "Show background dot grid pattern",
  "desc.syncWithEditor": "Sync graph focus with active editor file",
  "desc.edgeWeightThickness": "Thicker lines for repeated source-target pairs",
  "desc.edgeStrengthGlow": "Scale edge width by target node in-degree (high-degree = thicker)",
  "desc.perGroup": "Apply coordinate system per-group instead of globally",
  "desc.tagHierarchy": "Infer inheritance edges from tag parent/child hierarchy",
  "desc.nodeSize": "Base radius for nodes in pixels",
  "desc.cableTrunkWidth": "Trunk conduit line width (px)",
  "desc.cableTrunkAlpha": "Trunk conduit opacity",
  "desc.cableSpacing": "Space between parallel cables (px)",
  "desc.cableFanWidth": "Fan wire width (px)",
  "desc.cableFanAlpha": "Fan wire opacity",
  "desc.roadAlpha": "Road network overlay opacity",
  "desc.roadWidth": "Road network line width (px)",
  "desc.localGraphHops": "N-hop radius for local graph view",
  "desc.nodeSpacing": "Min gap between nodes (radius x n)",
  "desc.groupSize": "Overall group pattern scale",
  "desc.groupSpacing": "Gap between adjacent groups",
  "desc.centerForce": "Attraction toward canvas center",
  "desc.repelForce": "Node repulsion strength",
  "desc.linkForce": "Edge spring strength",
  "desc.linkDistance": "Preferred edge length",

  // --- Settings Tab ---
  "settingsTab.description": "Each setting can be edited directly from the graph view panel. Here you can export/import settings as JSON.",
  "settingsTab.import": "Import Settings",
  "settingsTab.importDesc": "Select a JSON file to load settings. Current settings will be overwritten.",
  "settingsTab.importBtn": "Import",
  "settingsTab.importDone": "Import complete",
  "settingsTab.importFail": "Import failed",
  "settingsTab.jsonPath": "Settings JSON File Path",
  "settingsTab.jsonPathDesc": "JSON file path within the vault (e.g., settings/graph-island.json). Used as export target.",
  "settingsTab.export": "Export Settings",
  "settingsTab.exportDesc": "Write current settings to a JSON file.",
  "settingsTab.exportBtn": "Export",
  "settingsTab.exportDone": "Export complete",
  "settingsTab.exportFail": "Export failed",
  "settingsTab.exportNoPath": "Please specify a JSON file path.",
  "settingsTab.preview": "Current Settings (Preview)",

  // --- Feature O: Multi-View Sync ---
  "display.syncView": "View Sync",
  "desc.syncView": "Synchronize panel state across multiple Graph Island views",

  // --- Feature P: Node Annotations ---
  "annotation.placeholder": "Enter text…",
  "annotation.delete": "Delete annotation",

  // --- Feature L: Node Bookmarks ---
  "bookmark.add": "Bookmark",
  "bookmark.remove": "Remove Bookmark",
  "section.bookmarks": "Bookmarks",
  "bookmark.empty": "No bookmarked nodes",

  // --- Feature M: Graph Statistics Dashboard ---
  "stats.nodes": "Nodes",
  "stats.edges": "Edges",
  "stats.filtered": "filtered",
  "stats.groups": "Groups",
  "stats.avgDegree": "Avg Degree",
  "stats.maxHub": "Max Hub",
  "stats.copyMarkdown": "Copy as Markdown",
  "stats.copied": "Statistics copied to clipboard",
  "stats.title": "Statistics",

  // --- Feature CX: Graph Statistics Panel ---
  "display.graphStats": "Graph Statistics",
  "desc.graphStats": "Show statistics panel (density, hubs, components)",
  "stats.density": "Density",
  "stats.components": "Components",
  "stats.topHubs": "Top Hubs",

  // --- Feature DA: Ancestry Breadcrumb Trail ---
  "display.ancestryBreadcrumb": "Ancestry Breadcrumb",
  "desc.ancestryBreadcrumb": "Show BFS path from hub to hovered node",

  // --- Feature DB: Vault Health Scorecard ---
  "stats.orphanRate": "Orphan Rate",
  "stats.tagCoverage": "Tag Coverage",
  "stats.edgeTypes": "Edge Types",

  // --- Feature CY: Subgraph Export ---
  "context.exportSubgraph": "Export subgraph (2-hop JSON)",
  "toast.subgraphExported": "Subgraph exported ({nodes} nodes, {edges} edges)",
  "context.createNote": "Create note here",
  "context.enterNoteName": "Enter note filename",
  "context.noteCreated": "Note '{name}' created",

  // --- Feature N: Edge Weight Labels ---

  // --- Feature CR: Edge Cardinality Count Labels ---

  // --- Unified edge label mode ---
  "display.edgeLabelMode": "Edge Label Mode",
  "desc.edgeLabelMode": "Choose what labels to display on edges",
  "display.edgeLabelMode.none": "None",
  "display.edgeLabelMode.relation": "Relation Type",
  "display.edgeLabelMode.weight": "Weight (count)",
  "display.edgeLabelMode.cardinality": "Cardinality",

  // --- Feature R: Louvain Community Detection ---
  "groupBy.louvain": "Auto-detect (Louvain)",

  // --- Feature S: Interactive Legend ---
  "display.showLegend": "Show Legend",
  "desc.showLegend": "Display floating legend overlay on graph canvas",

  // --- Feature CS: Off-Screen Node Indicator ---
  "display.oobIndicator": "Off-Screen Indicators",
  "desc.oobIndicator": "Show badge with count of nodes outside the visible viewport",
  "legend.nodeColors": "Node Colors",
  "legend.edgeRelations": "Edge Relations",
  "legend.hidden": "(hidden)",
  "legend.nodeShapes": "Node Shapes",
  "legend.shapeDefault": "Default node",
  "legend.shapeTag": "Tag node",

  // --- Feature N2: Search Mode ---
  "display.searchMode": "Search Mode",
  "search.modeFilter": "Filter",
  "search.modeHighlight": "Highlight",

  // --- Feature T: Graph Search History ---
  "search.clearHistory": "Clear history",
  "search.saveQuery": "Save this query",

  // --- Feature V: Graph Templates ---
  "template.save": "Save Template",
  "template.load": "Load Template",
  "template.delete": "Delete Template",
  "template.saved": "Template saved",
  "template.loaded": "Template applied",
  "template.deleted": "Template deleted",
  "template.namePrompt": "Enter template name:",
  "template.maxReached": "Maximum 20 templates. Delete one first.",
  "template.confirmDelete": "Delete template \"{name}\"?",

  // --- Feature C3/F2/C4/C6/C7/D5: Context menu & interaction ---
  "toast.ontologySet": "Node type set: {type}",
  "toast.ontologyFailed": "Failed to set node type",
  "toast.relationAdded": "Relation added: {type}",
  "toast.relationFailed": "Failed to add relation",
  "context.clusterCompare": "Compare this cluster",
  "context.multiSelect": "Add to selection",
  "action.cancel": "Cancel",
  "action.addTag": "Add tag",
  "action.setField": "Set field",
  "action.clearSelection": "Clear selection",
  "label.selectedNodes": "Selected: {count}",

  // --- S1/S6/S4: Structural visualization ---
  "display.hierarchyTree": "Hierarchy Tree Overlay",
  "desc.hierarchyTree": "Show parent-child tree from focused node as purple overlay",
  "display.ontologyBackbone": "Ontology Backbone",
  "desc.ontologyBackbone": "Show is-a hierarchy as translucent skeleton lines",
  "display.gapEdges": "Gap Detection Edges",
  "desc.gapEdges": "Show dashed lines between nodes that share tags but have no direct link",
  "context.insertBlank": "Insert blank node",
  "toast.blankInserted": "Blank node inserted — double-click to convert to note",
  // W6: Context menu i18n
  "context.openFile": "Open file",
  "context.pin": "Pin",
  "context.unpin": "Unpin",
  "context.copyPath": "Copy path",
  "context.pathStart": "Path: set start",
  "context.pathEnd": "Path: set end",
  "context.pathClear": "Path: clear",
  "context.setType": "Set type: {type}",
  "context.moveTo": "Move to: {group}",
  // D1: Expand/collapse neighbors
  "context.expand": "Expand neighbors",
  "context.collapse": "Collapse neighbors",
  // P2: Progressive Disclosure
  "panel.advanced": "Advanced settings",
};

// ---------------------------------------------------------------------------
// Japanese translations
// ---------------------------------------------------------------------------
const ja: TranslationMap = {
  // --- PanelBuilder: top-level controls ---
  "layout.label": "レイアウト",
  "layout.force": "Force",
  "layout.arc": "アーク",
  "search.placeholder": "検索… hop:名前:2",
  "settingsFilter.placeholder": "設定を検索…",
  "search.jumpHint": "Enterでノードにジャンプ",
  "search.filterHelp": "フィルタ構文:\n• tag:act — タグ完全一致\n• tag:act* — 前方一致（act, act1, action…）\n• tag:*act* — 部分一致\n• path:folder* — ファイルパスで絞り込み\n• category:note — カテゴリで絞り込み\n• key:value — フロントマターのフィールドで絞り込み\n\n演算子で組み合わせ:\n• tag:a AND tag:b — 両方一致\n• tag:a OR tag:b — どちらか一致\n• (tag:a OR tag:b) AND path:x*\n• tag:a NOR tag:b — どちらも不一致\n• tag:a XOR tag:b — 片方のみ一致\n\n特殊:\n• hop:名前:2 — N ホップ以内を強調表示",

  // --- PanelBuilder: section titles ---
  "section.filter": "フィルタ",
  "section.groups": "グループ",
  "section.display": "表示",
  "section.displayNodes": "ノード",
  "section.displayEdges": "エッジ",
  "section.displayGrouping": "グルーピング",
  "section.displayOther": "その他",
  "section.nodeRules": "ノードルール",
  "section.relationColors": "属性カラー",
  "section.clusterArrangement": "クラスター配置",
  "section.graphSync": "グラフ連携",
  "section.pluginSettings": "プラグイン設定",
  "section.ontology": "オントロジー",
  "section.customMappings": "カスタムマッピング",
  "section.tagRelations": "タグ間の関係",
  "tab.filter": "フィルタ",
  "tab.display": "表示",
  "tab.layout": "レイアウト",
  "tab.settings": "設定",
  "layout.type": "レイアウト種別",

  // --- PanelBuilder: concentric layout ---
  "concentric.showOrbitRings": "軌道リングを表示",
  "concentric.autoRotate": "自動回転",

  // --- PanelBuilder: filter ---
  "filter.attachments": "添付書類",
  "filter.existingOnly": "存在するファイルのみ表示",
  "filter.orphans": "オーファン",
  "filter.orphanClusterField": "孤立ノードグループフィールド",
  "filter.dataviewQuery": "Dataview フィルター",
  "filter.dataviewHint": "DQLソース (例: #tag, \"folder\")",
  "filter.dataviewUnavailable": "Dataviewプラグイン未インストール",
  "filter.tagDisplay": "タグ表示",
  "filter.tagDisplay.off": "非表示",
  "filter.tagDisplay.node": "ノード",
  "filter.tagDisplay.enclosure": "囲い",

  // --- PanelBuilder: groups ---
  "groups.addGroup": "新規グループ",
  "groups.expandAll": "すべて展開",
  "groups.collapseAll": "すべて折りたたみ",

  // --- PanelBuilder: display ---
  "display.arrows": "矢印",
  "display.nodeColor": "ノード色（自動）",
  "display.nodeColorMode": "ノードカラーモード",
  "display.nodeColor.default": "デフォルト",
  "display.nodeColor.category": "カテゴリ別",
  "display.nodeColor.heatmap": "ヒートマップ",
  "display.nodeColor.community": "コミュニティ",
  "desc.nodeColorMode": "ノードの色分け方式: デフォルト（単色）、カテゴリ（フロントマター）、ヒートマップ（接続数）、コミュニティ（Louvain）",
  "display.edgeColor": "エッジ色（属性別）",
  "display.fadeEdges": "結線の濃淡（被リンク数）",
  "display.textFade": "テキストフェードの閾値",
  "display.nodeSubLabelFields": "サブラベルフィールド",
  "display.hoverTooltipFields": "ホバーツールチップフィールド",
  "display.nodeSize": "ノードの大きさ",
  "display.nodeSizeByDegree": "次数比例サイズ",
  "desc.nodeSizeByDegree": "接続数に比例してノード半径をスケーリング",
  "display.hoverHops": "ホバー強調ホップ数",
  "display.focusCone": "フォーカスコーン",
  "display.focusMode": "フォーカスモード",
  "display.visualLinkEditor": "ビジュアルリンクエディタ",
  "display.missingNeighbors": "未接続同タグをハイライト",
  "display.links": "リンク",
  "display.sharedTags": "共有タグ",
  "display.sharedCategory": "共有カテゴリ",
  "display.semantic": "意味関係 (semantic)",
  "display.inheritance": "継承 (is-a)",
  "display.aggregation": "集約 (has-a)",
  "display.similar": "類似 (similar)",
  "display.sibling": "兄弟 (sibling)",
  "display.sequence": "順序 (next/prev)",
  "display.edgeLabelPlacement": "エッジラベル配置",
  "display.edgeLabelCenter": "中央",
  "display.edgeLabelOffset": "オフセット",
  "display.edgeLabelSmart": "スマート（重なり回避）",
  "display.edgeLayerMode": "レイヤー分離",
  "display.edgeDirectionFilter": "エッジ方向フィルタ",
  "display.edgeDirAll": "すべて",
  "display.edgeDirBidirectional": "双方向のみ",
  "display.edgeDirUnidirectional": "一方向のみ",
  "display.bidirectionalIndicator": "双方向インジケータ",
  "display.showPathfinderOverlay": "パスファインダーオーバーレイ",
  "display.edgeCardinality": "カーディナリティ記号",
  "display.cardinalityNone": "なし",
  "display.cardinalityCrowsfoot": "鳥の足記法",
  "display.cableBundleMode": "ケーブルバンドルモード",
  "display.cableModeAuto": "自動 (クラスタ時)",
  "display.cableModeAlways": "常時有効",
  "display.cableModeNever": "無効",
  "display.cableTrunkWidth": "ケーブル幹線の太さ",
  "display.cableTrunkAlpha": "ケーブル幹線の透明度",
  "display.cableSpacing": "ケーブル間隔",
  "display.cableFanWidth": "ファン電線の太さ",
  "display.cableFanAlpha": "ファン電線の濃淡",
  "desc.cableBundleMode": "クラスタ間エッジのケーブル化方法",
  "section.roadNetwork": "道路網",
  "display.showRoadNetwork": "道路網を表示",
  "display.roadRouteEdges": "エッジを道路に沿わせる",
  "display.roadAlpha": "道路の透明度",
  "display.roadWidth": "道路の太さ",
  "desc.showRoadNetwork": "自動生成された道路網オーバーレイを描画",
  "desc.roadRouteEdges": "エッジを直線ではなく道路に沿って配線",
  "display.minimap": "ミニマップ",
  "display.dotGrid": "背景ドットグリッド",
  "display.syncWithEditor": "エディタと同期",
  "display.edgeWeightThickness": "エッジ太さ（重み）",
  "display.edgeStrengthGlow": "エッジ強度グロー",
  "display.degreeEdgeWidth": "次数ベースのエッジ太さ",
  "desc.degreeEdgeWidth": "接続ノードの次数に基づいてエッジの太さを変化",
  "display.localGraphHops": "ローカルグラフ ホップ数",

  // --- Rendering thresholds ---
  "section.renderThresholds": "描画パフォーマンス",
  "render.cardTextNodeCount": "カードテキスト上限",
  "render.cardTextNodeCountDesc": "カードにテキストを描画するノード数の上限",
  "render.gradientNodeCount": "グラデーション上限",
  "render.gradientNodeCountDesc": "グラデーション描画を行うノード数上限（大きいほどGPU負荷増）",
  "render.glowNodeCount": "グロー上限",
  "render.glowNodeCountDesc": "グローハロー描画を行うノード数上限",
  "render.clusterChargeForce": "クラスタ斥力",
  "render.clusterChargeForceDesc": "クラスタシミュレーションの反発力（負の値＝反発）",
  "render.gridLabelOffset": "グリッドラベル距離",
  "render.gridLabelOffsetDesc": "グリッド線とラベルの間の距離（px）",
  "render.showFpsMonitor": "FPS表示",
  "render.showFpsMonitorDesc": "ツールバーにレンダリングFPSカウンターを表示",
  "render.highlightDimAlpha": "ハイライト暗化度",
  "render.highlightDimAlphaDesc": "検索ハイライト時の非一致エッジ/ノードの不透明度",
  "render.showRecentVisitHalo": "最近訪問ハロ",
  "render.showRecentVisitHaloDesc": "最近ナビゲートしたノードに青いハロを表示",

  "display.groupBy": "グルーピング",
  "display.groupMinSize": "最小グループサイズ",
  "display.groupFilter": "グループフィルタ",

  // --- PanelBuilder: node shapes ---
  "display.tagNodeShape": "タグノードの形状",
  "display.defaultNodeShape": "デフォルトの形状",
  "shape.circle": "丸",
  "shape.triangle": "三角形",
  "shape.diamond": "ダイヤ",
  "shape.hexagon": "六角形",
  "shape.square": "四角形",

  // --- PanelBuilder: node rules ---
  "nodeRules.addRule": "ルール追加",
  "nodeRules.spacing": "間隔",
  "nodeRules.gravity": "重力",
  "nodeRules.color": "カラー",

  // --- PanelBuilder: gravity coefficients ---
  "gravity.centerGravity": "中心引力",
  "gravity.repelMultiplier": "反発係数",
  "gravity.interGroupAttraction": "グループ間引力",
  "gravity.interGroupAttractionDesc": "値が大きいほどグループ同士が近づく",
  "gravity.intraGroupDensity": "グループ内密度",
  "gravity.intraGroupDensityDesc": "値が大きいほどグループ内のノードが密集する",

  // --- PanelBuilder: relation colors ---
  "relationColors.changeColor": "クリックで色を変更",

  // --- PanelBuilder: cluster arrangement ---
  "cluster.pattern": "配置パターン",
  "cluster.concentric": "同心円",
  "cluster.radial": "放射",
  "cluster.phyllotaxis": "フィロタキシス",
  "cluster.grid": "正方形",
  "cluster.triangle": "三角形",
  "cluster.random": "無秩序",
  "cluster.timeline": "タイムライン",
  "cluster.custom": "カスタム",
  "coord.transformExprHint": "例: COS(tag:?), BIN(degree, 5), ROSE(index)",
  "coord.transformExprHelp": "ソース: index, degree, folder, tag:?, hop:名前:3\n変換: LINEAR, BIN, STACK, GOLDEN, EVEN, DATE_INDEX\n曲線: ARCHIMEDEAN, ROSE, FERMAT, LISSAJOUS, ...\n数学: sin, cos, tan, sqrt, abs, log, exp, floor, ceil, min, max, pow, atan2\n演算子: + - * / % ^ (べき乗)\n変数: t (0–1), i (インデックス), n (個数), v (値)\n定数: pi, e, tau  |  ギリシャ文字: π=pi, θ=t, α→a 等\n暗黙の乗算: 2t → 2*t, πr → pi*r\n書式: 関数(ソース, パラメータ...) または数式",
  "coord.exprLibrary": "式ライブラリ",
  "coord.libraryHint": "クリックして軸の式に挿入",
  "coord.autoOptimize": "再調整",
  "coord.autoOptimizeRunning": "最適化中...",
  "coord.variableReference": "変数一覧",
  "cluster.autoFit": "間隔を自動調整",
  "cluster.nodeSpacing": "ノード間隔 (半径×n)",
  "cluster.groupSize": "グループサイズ",
  "cluster.groupSpacing": "グループ間隔",
  "cluster.groupArrangement": "グループ配置",
  "cluster.groupArrangementAuto": "自動（パターンに従う）",
  "cluster.groupArrangementCircle": "円形",
  "cluster.groupArrangementHorizontal": "横並び",
  "cluster.groupArrangementVertical": "縦並び",
  "cluster.groupArrangementConcentric": "同心円",
  "cluster.groupArrangementGrid": "グリッド",
  "cluster.edgeBundleStrength": "エッジ束ね強度",
  "cluster.groupRulesHeading": "グループ分けルール",
  "cluster.addGroupRule": "＋ グループルール追加",
  "cluster.gravityRulesHeading": "方向重力ルール",
  "cluster.addGravityRule": "＋ 重力ルール追加",
  "cluster.sortHeading": "ソート順",
  "cluster.addSortRule": "＋ ソートルール追加",
  "cluster.followsGroupBy": "グルーピングに連動",
  "cluster.followsGroupByDesc": "グルーピング設定をクラスター配置にも使用",
  "cluster.usingGroupBy": "グルーピング設定を使用中",

  // --- PanelBuilder: force strength ---
  "force.centerForce": "中心力",
  "force.repelForce": "反発力",
  "force.linkForce": "リンクの力",
  "force.linkDistance": "リンク距離",

  // --- PanelBuilder: plugin settings ---
  "settings.metadataFields": "メタデータフィールド",
  "settings.colorField": "色分けフィールド",
  "settings.groupField": "グループフィールド",
  "settings.enclosureMinRatio": "囲い最小比率",
  "settings.ontologyHeading": "― オントロジー ―",
  "settings.inheritanceFields": "正方向",
  "settings.aggregationFields": "正方向",
  "settings.reverseInheritanceFields": "逆方向",
  "settings.reverseAggregationFields": "逆方向",
  "settings.similarFields": "類似フィールド",
  "settings.siblingFields": "兄弟フィールド",
  "settings.sequenceFields": "正方向",
  "settings.reverseSequenceFields": "逆方向",
  "settings.ontAddRule": "ルール追加",
  "settings.tagHierarchy": "タグ階層 → 継承エッジ",
  "settings.customMappingsHeading": "― カスタムマッピング ―",
  "settings.mappingFieldPlaceholder": "フィールド名",
  "settings.mappingType.inheritance": "継承 (is-a)",
  "settings.mappingType.aggregation": "集約 (has-a)",
  "settings.mappingType.similar": "類似",
  "settings.mappingType.sibling": "兄弟",
  "settings.mappingType.sequence": "順序",
  "settings.addMapping": "＋ マッピング追加",
  "settings.tagRelationsHeading": "― タグ間の関係 ―",
  "settings.tagRelSourcePlaceholder": "ソースタグ",
  "settings.tagRelTargetPlaceholder": "ターゲットタグ",
  "settings.tagRelType.inheritance": "継承 (is-a)",
  "settings.tagRelType.aggregation": "集約 (has-a)",
  "settings.addTagRelation": "＋ タグ関係追加",

  // --- PanelBuilder: empty state ---
  "empty.title": "表示するノードがありません",
  "empty.hint": "このプラグインは Vault 内のノート・リンク・タグ・frontmatter メタデータからグラフを構築します。",
  "empty.step1": "ノート間に [[リンク]] を作成する",
  "empty.step2": "タグ（#character, #location）や frontmatter フィールドを追加する",
  "empty.step3": "下の「プラグイン設定」でメタデータフィールドを設定する",

  // --- PanelBuilder: presets ---
  "preset.simple": "シンプル",
  "preset.simpleDesc": "最小限の設定 — リンクのみ、すっきり表示",
  "preset.analysis": "分析",
  "preset.analysisDesc": "全エッジ種別、属性色分け、被リンク数でサイズ変更",
  "preset.creative": "創作",
  "preset.creativeDesc": "タグ囲い、タグでグループ化、意味関係エッジ",
  "preset.activeFocus": "アクティブフォーカス",
  "preset.activeFocusDesc": "編集中ファイルを中心に2ホップ近隣を表示",
  "preset.fullAnalysis": "フル分析",
  "preset.fullAnalysisDesc": "全機能ON: 統計、ブリッジ、エントロピー、コミュニティ色、欠落隣接",

  // --- PanelBuilder: timeline ---
  "timeline.timeKey": "時間フィールド",
  "timeline.timeKeyHint": "時間軸に使うfrontmatterフィールド（例: date, era, turn）",
  "timeline.endKey": "終了時間フィールド",
  "timeline.endKeyHint": "期間の終了を表すfrontmatterフィールド（例: end-date, end_time）",
  "timeline.showDurationBars": "期間バーを表示",
  "timeline.showRoutes": "ルート線を表示",
  "timeline.showTickLabels": "目盛りラベル表示",
  "timeline.showTickLabelsDesc": "タイムライン軸の目盛りにテキストラベルを表示",
  "timeline.orderFields": "順序フィールド",
  "timeline.orderFieldsHint": "リンクベース順序推論用フィールド（カンマ区切り: next, prev, parent_id, story_order）",
  "timeline.range": "表示期間",
  "coord.system": "座標形式",
  "coord.cartesian": "直交座標 (X, Y)",
  "coord.polar": "極座標 (r, θ)",
  "coord.perGroup": "グループごとに座標形成",
  "coord.range": "範囲",
  // --- PanelBuilder: axis transform ---
  "transform.linear": "線形",
  "transform.bin": "ビン分割",
  "transform.expression": "数式",
  "transform.curve": "曲線",
  "transform.exprError": "無効な数式",
  "transform.exprValid": "有効",
  "curve.archimedean": "アルキメデスの螺旋",
  "curve.rose": "バラ曲線",

  "coord.constants": "定数",
  "coord.constantsHint": "数式で使う変数を定義 (例: k=6 辺数, d=0.5 密度)",
  "coord.addConstant": "+ 定数を追加",
  "coord.systemConstants": "重複制御",
  "coord.sysBlend": "スナップ強度",
  "coord.sysOverlapPad": "グループ余白",
  "coord.sysMinGap": "最小ノード間隔",
  "coord.constantKey": "名前",
  "coord.constantValue": "値",

  "guide.gridTableMode": "カスタムグリッド",
  "guide.gridTableModeDesc": "座標レイアウトにカスタムグリッドを表示",
  "guide.gridStyle": "グリッドスタイル",
  "guide.gridStyle.lines": "ライン",
  "guide.gridStyle.table": "テーブル",
  "guide.gridShowHeaders": "ヘッダー表示",
  "guide.gridShowHeadersDesc": "行・列のヘッダーラベルを表示",
  "guide.showAxisTitles": "軸タイトル表示",
  "guide.showAxisTitlesDesc": "座標グリッドに軸名ラベルを表示",
  "guide.gridCellShading": "セルシェーディング",
  "guide.gridCellShadingDesc": "ノード密度でセルを着色",
  "guide.labelPlacement": "ラベル配置",
  "guide.labelOnLine": "線上（目盛り）",
  "guide.labelBetween": "線間（タイトル）",

  // --- PanelBuilder: node display mode ---
  "display.nodeDisplayMode": "表示モード",
  "display.modeNode": "ノード（図形）",
  "display.modeCard": "カード",
  "display.modeDonut": "ドーナツ",
  "display.modeSunburst": "サンバーストセグメント",
  "display.cardFields": "カード表示フィールド",
  "display.cardMaxWidth": "カード幅",
  "display.cardShowIcon": "アイコン表示",
  "display.cardHeaderStyle": "カードスタイル",
  "display.cardStylePlain": "シンプル",
  "display.cardStyleTable": "テーブル（ER図）",
  "display.donutBreakdown": "内訳フィールド",
  "display.donutInnerRadius": "内径",

  // --- PanelBuilder: shared presets ---
  "preset.export": "プリセットをエクスポート",
  "preset.exportDiff": "変更のみエクスポート",
  "preset.exportDiffDesc": "デフォルトから変更された設定のみをエクスポート",
  "preset.import": "プリセットをインポート",
  "preset.exported": "プリセットをクリップボードにコピーしました",
  "preset.importError": "無効なプリセット JSON です",
  "preset.importPrompt": "プリセット JSON を貼り付けてください:",

  // --- M1: 思考モード ---
  "mode.explore": "探索",
  "mode.exploreDesc": "つながりを発見 — 編集中ファイル中心、ギャップ検出、提案",
  "mode.analyze": "分析",
  "mode.analyzeDesc": "構造全体を分析 — 統計、ブリッジ、エントロピー、コミュニティ",
  "mode.write": "執筆",
  "mode.writeDesc": "現在のノートに集中 — プレゼン、リレーション、ローカルグラフ",
  "toast.modeApplied": "{name}モードに切り替えました",

  // --- Toast notifications ---
  "toast.presetApplied": "プリセット適用: {name}",
  "toast.pngExported": "PNG をエクスポートしました",
  "toast.pngFailed": "PNG エクスポート失敗",
  "toast.copiedToClipboard": "クリップボードにコピーしました",
  "toast.clipboardFailed": "クリップボードコピー失敗",
  "toast.localGraphOn": "ローカル: {name} ({hops} ホップ)",
  "toast.localGraphOff": "グローバルグラフ",
  "toast.embedSuccess": "グラフをノートに埋め込みました",
  "toast.embedFailed": "グラフの埋め込みに失敗しました",
  "toast.embedNoEditor": "埋め込み先のエディタがありません",
  "toast.embedNoGraph": "アクティブなグラフビューがありません",
  "toast.linkCreated": "リンク作成: {source} → {target}",
  "toast.linkFailed": "リンク作成に失敗しました",

  // --- PanelBuilder: action buttons ---
  "action.save": "設定を保存",
  "action.reset": "初期化",

  // --- PanelBuilder: help ---
  "help.ariaLabel": "ヘルプ",

  // --- PanelBuilder: direction ---

  // --- PanelBuilder: query hint ---
  "query.pathMatch": "ファイルへのパスに一致",
  "query.fileMatch": "ファイル名に一致",
  "query.tagSearch": "タグを検索",
  "query.categoryMatch": "カテゴリに一致",
  "query.idMatch": "ノードIDに一致",
  "query.isTag": "タグノードのみ",
  "query.hop": "ノードからNホップ以内",
  "query.property": "プロパティに一致",
  "query.boolOps": "ブール演算子で結合",
  "query.all": "すべてのノードに一致",
  "query.viewDetails": "詳細を閲覧",
  "query.candidates": "の候補",
  "query.searchOptions": "検索オプション",

  // --- PanelBuilder: expression editor ---
  "expr.addCondition": "＋ 条件追加",

  // --- PanelBuilder: sort key options ---
  "sort.degree": "リンク数",
  "sort.inDegree": "被リンク数",
  "sort.tag": "タグ",
  "sort.category": "カテゴリ",
  "sort.label": "ラベル",
  "sort.importance": "伝播重要度",
  "sort.asc": "↑昇順",
  "sort.desc": "↓降順",

  // --- PanelBuilder: cluster group options ---
  "clusterGroup.recursive": "再帰",

  // --- PanelBuilder: gravity direction ---
  "gravDir.none": "なし",
  "gravDir.up": "↑上",
  "gravDir.down": "↓下",
  "gravDir.left": "←左",
  "gravDir.right": "→右",
  "gravDir.custom": "角度指定",
  "gravDir.top": "上",
  "gravDir.bottom": "下",

  // --- NodeDetailView ---
  "detail.holdAriaLabel": "ホールド（表示を固定）",
  "detail.emptyHint": "グラフ上のノードにホバーすると詳細が表示されます",
  "detail.linkCount": "リンク数",
  "detail.category": "カテゴリ",
  "detail.openFile": "ファイルを開く →",
  "detail.preview": "プレビュー",
  "detail.emptyFile": "（空のファイル）",
  "detail.noContent": "（本文なし）",
  "detail.properties": "プロパティ",
  "detail.linkedNodes": "リンク中のノード",
  "detail.suggestedLinks": "リンク提案",
  "detail.backlinks": "バックリンク",

  // --- Node Comparison View ---
  "compare.title": "ノード比較",
  "compare.clear": "クリア",
  "compare.selectHint": "グラフ上で2つのノードをCtrl+クリックして比較します",
  "compare.sharedNeighbors": "共通の隣接ノード",
  "compare.uniqueTo": "{name} 固有のノード",
  "compare.sharedTags": "共通タグ",
  "compare.sharedCategories": "共通カテゴリ",
  "compare.shortestPath": "最短経路",
  "compare.noPath": "経路なし",
  "compare.hops": "{n} ホップ",

  // --- Accessibility ---
  "a11y.canvasLabel": "グラフ可視化キャンバス。Tabでノード切り替え、+/-でズーム。",

  // --- GraphViewContainer: toolbar ---
  "toolbar.fitAll": "全体俯瞰",
  "toolbar.zoomIn": "ズームイン",
  "toolbar.zoomOut": "ズームアウト",
  "toolbar.marquee": "範囲拡大",
  "toolbar.exportPng": "PNGで書き出し",
  "toolbar.exporting": "書き出し中…",
  "toolbar.copyClipboard": "クリップボードにコピー",
  "toolbar.localGraph": "ローカルグラフ",
  "toolbar.graphSettings": "グラフ設定",
  "toolbar.snapshot": "スナップショット",
  "toolbar.embedInNote": "ノートにグラフを埋め込む",

  // --- スナップショット ---
  "snapshot.save": "スナップショットを保存...",
  "snapshot.delete": "削除",
  "snapshot.clearDiff": "差分オーバーレイを解除",
  "snapshot.limitReached": "スナップショットは最大10件です。先に削除してください。",
  "snapshot.saved": "スナップショット '{name}' を保存しました",
  "snapshot.deleted": "スナップショット '{name}' を削除しました",
  "snapshot.enterName": "スナップショット名を入力",
  "snapshot.enterNotes": "メモを追加（任意）",
  "nav.back": "戻る",
  "nav.forward": "進む",
  "display.soloEdgeType": "ソロ",
  "desc.soloEdgeType": "1つのエッジ種別のみ表示（クリックで切替）",
  "section.nodeDecorations": "ノード装飾",
  "display.semanticZoom": "セマンティックズーム",
  "desc.semanticZoom": "ノードの画面サイズに応じた表示切替（ドット→円→コンパクトカード→フルカード）",
  "display.autoLOD": "自動LOD",
  "desc.autoLOD": "ズームレベルに応じて詳細度を自動調整 — 近接時にコンパクトカード、遠方時にドット",
  "display.showTagBadges": "タグバッジ",
  "desc.showTagBadges": "ノード周囲にカラーのタグバッジを表示",
  "display.showImportanceRing": "重要度リング",
  "desc.showImportanceRing": "メトリックに比例したリングを表示（青→赤グラデーション）",
  "display.importanceMetric": "メトリック",
  "desc.importanceMetric": "重要度リングのメトリックを選択",
  "display.metricDegree": "次数",
  "display.metricBetweenness": "媒介中心性",
  "display.metricPagerank": "PageRank",
  "display.showRecencyMarker": "鮮度マーカー",
  "desc.showRecencyMarker": "最近更新のノードに緑ドット、古いノードをフェード",
  "display.recencyDays": "鮮度日数",
  "display.definitionField": "定義フィールド",
  "section.structureAnalysis": "構造分析",
  "display.clusterLabelDetail": "クラスタラベル詳細度",
  "desc.clusterLabelDetail": "クラスタラベルの情報量",
  "display.clusterLabelMinimal": "最小",
  "display.clusterLabelStandard": "標準",
  "display.clusterLabelDetailed": "詳細",
  "display.clusterLabelRich": "リッチ（件数+タグ）",
  "display.gapDetectionMode": "ギャップ検出",
  "desc.gapDetectionMode": "知識構造のギャップを検出",
  "display.gapWithinTag": "タグ内",
  "display.gapCrossCluster": "クラスタ間",
  "display.gapBoth": "両方",
  "display.highlightPatterns": "パターンハイライト",
  "desc.highlightPatterns": "関節点・スポーク・クリークを強調表示",
  "display.showBridgeNodes": "ブリッジノード",
  "desc.showBridgeNodes": "媒介中心性上位のブリッジノードを金リングで強調",
  "display.focusLayout": "フォーカスレイアウト",
  "desc.focusLayout": "自我中心レイアウト：選択ノードを中心に関係タイプ別配置",
  "display.showHierarchyBreadcrumb": "階層パンくず",
  "desc.showHierarchyBreadcrumb": "継承パスをグラフ上にパンくず表示",
  "section.discovery": "発見・インサイト",
  "toolbar.surprise": "サプライズ — 無関連な2ノードを表示",
  "surprise.noMatch": "適切なペアが見つかりません — もう一度お試しください",
  "section.surprise": "サプライズモード",
  "display.surpriseInterval": "自動サプライズ (秒)",
  "desc.surpriseInterval": "N秒ごとにランダムな並置を自動トリガー (0 = 無効)",
  "display.showSimilarSuggestions": "類似サジェスト",
  "desc.showSimilarSuggestions": "ホバー時にJaccard類似度で未リンクの類似ノートを表示",
  "display.showStructureQuestions": "構造質問",
  "desc.showStructureQuestions": "グラフ構造から質問を生成して統計パネルに表示",
  "display.showEntropyOverlay": "知識エントロピー",
  "desc.showEntropyOverlay": "低密度の知識ギャップをヒートマップで表示",
  "display.analysisOverlay": "分析オーバーレイ",
  "analysis.off": "オフ",
  "analysis.bridges": "ブリッジノード",
  "analysis.entropy": "知識エントロピー",
  "analysis.gaps": "ギャップエッジ",
  "analysis.missing": "欠落隣接",
  "analysis.all": "すべて",

  // --- M2: Ego Layout ---
  "cluster.ego": "エゴ（フォーカス中心）",
  "action.applyEgoLayout": "エゴレイアウトを適用",

  // --- Phase 4: Interaction Enhancements ---
  "display.relationTypePicker": "関係タイプピッカー",
  "desc.relationTypePicker": "エッジを右クリックして関係タイプを割り当て",
  "display.multiSelect": "マルチ選択",
  "desc.multiSelect": "Shift+クリックで複数ノードを選択し一括操作",
  "display.inlineEdit": "インライン編集",
  "desc.inlineEdit": "ダブルクリックでフロントマターを直接編集",
  "display.relationDrawer": "関係ドロワー",
  "desc.relationDrawer": "関係の詳細を表示する拡張サイドパネル",
  "display.manualClustering": "手動クラスタリング",
  "desc.manualClustering": "ノードをドラッグしてグループ間で移動",

  // --- Phase 5: Discovery (D5) ---
  "display.clusterCompare": "クラスタ比較",
  "desc.clusterCompare": "2つのクラスタを比較：共有接続、固有メンバー、ブリッジノード",

  // --- Phase 6: ExcaliBrain (F2, F5) ---
  "display.inlineOntologyEditor": "インラインオントロジーエディタ",
  "desc.inlineOntologyEditor": "コンテキストメニューでオントロジータイプを割り当て",
  "display.relationMatrix": "関係マトリクス",
  "desc.relationMatrix": "ノード関係の隣接行列ビューを表示",

  // --- Phase 7: Advanced (E5) ---
  "display.presentationMode": "プレゼンテーションモード",
  "desc.presentationMode": "グラフノードのステップスルーガイドツアー",
  "action.addWaypoint": "ウェイポイント追加",
  "action.nextStep": "次へ →",
  "action.prevStep": "← 前へ",

  // --- Error messages ---
  "error.pixiInitFailed": "グラフの描画に失敗しました。お使いのブラウザがWebGLに対応していない可能性があります。",
  "error.graphBuildFailed": "グラフデータの構築に失敗しました。コンソールで詳細を確認してください。",
  "error.layoutFailed": "レイアウト計算に失敗しました。別のレイアウトをお試しください。",

  // --- Setting descriptions (tooltips) ---
  "desc.existingOnly": "ファイルのないノートを非表示",
  "desc.orphans": "接続のないノードの表示/非表示",
  "desc.textFade": "ラベルが消えるズームレベル",
  "desc.hoverHops": "ホバー時の強調範囲",
  "desc.focusCone": "距離ベースのフェードアウト — ホバー時に近いノードほど明るく表示",
  "desc.focusMode": "ノードをクリックでハイライト固定。Escapeで解除。",
  "desc.visualLinkEditor": "Alt+ドラッグでノード間に [[wikilink]] を作成します。",
  "desc.missingNeighbors": "同じタグを共有するが直接エッジがないノードをマーク（知識のギャップ検出）。",
  "desc.edgeBundleStrength": "0=直線, 1=完全に束ねる",
  "desc.autoFit": "ノード数から間隔を自動計算",
  "desc.fadeEdges": "接続の少ないエッジを薄く",
  "desc.enclosureSpacing": "包絡線のパディング",
  "desc.groupMinSize": "これ未満のグループを統合",
  "desc.tagDisplay": "タグを個別ノードまたは包絡線で表示",
  "desc.nodeDisplayMode": "ノードの表示形式: ドット / カード / ドーナツ / リングチャート",
  "desc.tagNodeShape": "タグノードに使用する形状",
  "desc.defaultNodeShape": "通常ノードのデフォルト形状",
  "desc.edgeCardinality": "エッジに 1:N / N:M マーカーを表示",
  "desc.clusterPattern": "グループ内ノードの配置パターン",
  "desc.coordSystem": "グループ配置の座標系",
  "desc.groupArrangement": "グループ間の相対的な配置方式",
  "desc.timelineRange": "表示する時間範囲（全体の%）",
  "desc.attachments": "画像・添付ファイルの表示/非表示",
  "desc.nodeColor": "フロントマターのカテゴリでノードを色分け",
  "desc.arrows": "すべてのエッジに方向矢印を表示",
  "desc.edgeColor": "関係種別でエッジを色分け",
  "desc.edgeLayerMode": "エッジ種別ごとにZ順でレイヤー分離描画",
  "desc.edgeDirectionFilter": "エッジの方向性でフィルタ（A→B vs A↔B）",
  "desc.bidirectionalIndicator": "双方向エッジを視覚的に区別（太い線）",
  "desc.showPathfinderOverlay": "選択したノード間のBFS最短経路にシアン発光オーバーレイを表示",
  "desc.links": "ウィキリンクエッジの表示/非表示",
  "desc.sharedTags": "同じタグを持つノート間のエッジを表示",
  "desc.sharedCategory": "同じカテゴリのノート間のエッジを表示",
  "desc.semantic": "AI検出の意味的類似エッジを表示",
  "desc.inheritance": "is-a（親子）エッジを表示",
  "desc.aggregation": "has-a（構成）エッジを表示",
  "desc.similar": "類似コンテンツエッジを表示",
  "desc.sibling": "兄弟（同格）エッジを表示",
  "desc.sequence": "前後の順序エッジを表示",
  "desc.minimap": "ナビゲーション用ミニマップを表示",
  "desc.dotGrid": "背景ドットグリッドパターンを表示",
  "desc.syncWithEditor": "エディタのアクティブファイルとグラフを同期",
  "desc.edgeWeightThickness": "同一ペアの繰り返しを太線で表示",
  "desc.edgeStrengthGlow": "ターゲットノードの入次数に応じてエッジの太さを変化（高次数＝太い）",
  "desc.perGroup": "座標系をグローバルではなくグループごとに適用",
  "desc.tagHierarchy": "タグの親子階層から継承エッジを推定",
  "desc.nodeSize": "ノードの基本半径（px）",
  "desc.cableTrunkWidth": "幹線の線幅（px）",
  "desc.cableTrunkAlpha": "幹線の不透明度",
  "desc.cableSpacing": "平行ケーブル間の間隔（px）",
  "desc.cableFanWidth": "ファン電線の線幅（px）",
  "desc.cableFanAlpha": "ファン電線の不透明度",
  "desc.roadAlpha": "道路網オーバーレイの不透明度",
  "desc.roadWidth": "道路網の線幅（px）",
  "desc.localGraphHops": "ローカルグラフのNホップ半径",
  "desc.nodeSpacing": "ノード間の最小距離（半径×n）",
  "desc.groupSize": "グループパターン全体のスケール",
  "desc.groupSpacing": "隣接グループ間の距離",
  "desc.centerForce": "キャンバス中心への引力",
  "desc.repelForce": "ノード間の反発力",
  "desc.linkForce": "エッジのバネの強さ",
  "desc.linkDistance": "エッジの目標長さ",

  // --- Settings Tab ---
  "settingsTab.description": "各設定項目はグラフビューのパネルから直接編集できます。ここでは設定の JSON エクスポート / インポートを行えます。",
  "settingsTab.import": "設定をインポート",
  "settingsTab.importDesc": "JSON ファイルを選択して設定を読み込みます。現在の設定は上書きされます。",
  "settingsTab.importBtn": "インポート",
  "settingsTab.importDone": "インポート完了",
  "settingsTab.importFail": "インポート失敗",
  "settingsTab.jsonPath": "設定 JSON ファイルパス",
  "settingsTab.jsonPathDesc": "Vault 内の JSON ファイルパス（例: settings/graph-island.json）。エクスポート先に使用します。",
  "settingsTab.export": "設定をエクスポート",
  "settingsTab.exportDesc": "現在の設定を JSON ファイルに書き出します。",
  "settingsTab.exportBtn": "エクスポート",
  "settingsTab.exportDone": "エクスポート完了",
  "settingsTab.exportFail": "エクスポート失敗",
  "settingsTab.exportNoPath": "JSON ファイルパスを指定してください。",
  "settingsTab.preview": "現在の設定（プレビュー）",

  // --- Feature O: ビュー同期 ---
  "display.syncView": "ビュー同期",
  "desc.syncView": "複数の Graph Island ビュー間でパネル状態を同期",

  // --- Feature P: ノード注釈 ---
  "annotation.placeholder": "テキストを入力…",
  "annotation.delete": "注釈を削除",

  // --- Feature L: ノードブックマーク ---
  "bookmark.add": "ブックマーク",
  "bookmark.remove": "ブックマーク解除",
  "section.bookmarks": "ブックマーク",
  "bookmark.empty": "ブックマークされたノードはありません",

  // --- Feature M: グラフ統計ダッシュボード ---
  "stats.nodes": "ノード",
  "stats.edges": "エッジ",
  "stats.filtered": "フィルタ中",
  "stats.groups": "グループ",
  "stats.avgDegree": "平均次数",
  "stats.maxHub": "最大ハブ",
  "stats.copyMarkdown": "Markdownでコピー",
  "stats.copied": "統計をクリップボードにコピーしました",
  "stats.title": "統計",

  // --- Feature CX: グラフ統計パネル ---
  "display.graphStats": "グラフ統計",
  "desc.graphStats": "統計パネルを表示（密度、ハブ、連結成分）",
  "stats.density": "密度",
  "stats.components": "連結成分",
  "stats.topHubs": "上位ハブ",

  // --- Feature DA: 祖先パンくずトレイル ---
  "display.ancestryBreadcrumb": "祖先パンくず",
  "desc.ancestryBreadcrumb": "ハブからホバーノードまでのBFSパスを表示",

  // --- Feature DB: Vault Health Scorecard ---
  "stats.orphanRate": "孤立率",
  "stats.tagCoverage": "タグカバレッジ",
  "stats.edgeTypes": "エッジ種別",

  // --- Feature CY: サブグラフエクスポート ---
  "context.exportSubgraph": "サブグラフをエクスポート（2ホップ JSON）",
  "toast.subgraphExported": "サブグラフをエクスポートしました（{nodes}ノード、{edges}エッジ）",
  "context.createNote": "ここにノートを作成",
  "context.enterNoteName": "ノートのファイル名を入力",
  "context.noteCreated": "ノート '{name}' を作成しました",

  // --- Feature N: エッジ重みラベル ---

  // --- Feature CR: エッジ多重度ラベル ---

  // --- 統一エッジラベルモード ---
  "display.edgeLabelMode": "エッジラベルモード",
  "desc.edgeLabelMode": "エッジに表示するラベルの種類を選択",
  "display.edgeLabelMode.none": "なし",
  "display.edgeLabelMode.relation": "関係種別",
  "display.edgeLabelMode.weight": "重み（本数）",
  "display.edgeLabelMode.cardinality": "多重度",

  // --- Feature R: Louvain コミュニティ検出 ---
  "groupBy.louvain": "自動検出 (Louvain)",

  // --- Feature S: インタラクティブ凡例 ---
  "display.showLegend": "凡例を表示",
  "desc.showLegend": "グラフキャンバス上に凡例オーバーレイを表示",

  // --- Feature CS: 画面外ノード指示器 ---
  "display.oobIndicator": "画面外ノード指示器",
  "desc.oobIndicator": "表示領域外にあるノード数をバッジで表示",

  "legend.nodeColors": "ノードカラー",
  "legend.edgeRelations": "エッジ属性",
  "legend.nodeShapes": "ノードシェイプ",
  "legend.shapeDefault": "デフォルトノード",
  "legend.shapeTag": "タグノード",
  "legend.hidden": "(非表示)",

  // --- Feature N2: 検索モード ---
  "display.searchMode": "検索モード",
  "search.modeFilter": "フィルタ",
  "search.modeHighlight": "ハイライト",

  // --- Feature T: 検索履歴 ---
  "search.clearHistory": "履歴をクリア",
  "search.saveQuery": "このクエリを保存",

  // --- Feature V: グラフテンプレート ---
  "template.save": "テンプレート保存",
  "template.load": "テンプレート読込",
  "template.delete": "テンプレート削除",
  "template.saved": "テンプレートを保存しました",
  "template.loaded": "テンプレートを適用しました",
  "template.deleted": "テンプレートを削除しました",
  "template.namePrompt": "テンプレート名を入力:",
  "template.maxReached": "テンプレートは最大20件です。先に削除してください。",
  "template.confirmDelete": "テンプレート「{name}」を削除しますか？",

  // --- Feature C3/F2/C4/C6/C7/D5 ---
  "toast.ontologySet": "ノードタイプを設定: {type}",
  "toast.ontologyFailed": "ノードタイプの設定に失敗",
  "toast.relationAdded": "リレーション追加: {type}",
  "toast.relationFailed": "リレーションの追加に失敗",
  "context.clusterCompare": "このクラスタを比較",
  "context.multiSelect": "選択に追加",
  "action.cancel": "キャンセル",
  "action.addTag": "タグ追加",
  "action.setField": "フィールド設定",
  "action.clearSelection": "選択クリア",
  "label.selectedNodes": "選択中: {count}",

  // --- S1/S6/S4: 構造可視化 ---
  "display.hierarchyTree": "階層ツリーオーバーレイ",
  "desc.hierarchyTree": "フォーカスノードからの親子ツリーを紫色で描画",
  "display.ontologyBackbone": "オントロジー骨格",
  "desc.ontologyBackbone": "is-a 階層を半透明の骨格線で表示",
  "display.gapEdges": "ギャップ検出エッジ",
  "desc.gapEdges": "タグを共有するが直接リンクがないノード間を点線で表示",
  "context.insertBlank": "空白ノードを挿入",
  "toast.blankInserted": "空白ノードを挿入しました — ダブルクリックでノートに変換",
  // W6: コンテキストメニュー i18n
  "context.openFile": "ファイルを開く",
  "context.pin": "ピン留め",
  "context.unpin": "ピン解除",
  "context.copyPath": "パスをコピー",
  "context.pathStart": "パス: 始点に設定",
  "context.pathEnd": "パス: 終点に設定",
  "context.pathClear": "パス: クリア",
  "context.setType": "タイプ設定: {type}",
  "context.moveTo": "移動先: {group}",
  // D1: Expand/collapse neighbors
  "context.expand": "隣接を展開",
  "context.collapse": "隣接を折りたたみ",
  // P2: Progressive Disclosure
  "panel.advanced": "詳細設定",
};

// ---------------------------------------------------------------------------
// Help text translations (separate map to keep main map lightweight)
// ---------------------------------------------------------------------------

const helpEn: TranslationMap = {
  "help.filter": "Controls which nodes and edges appear in the graph.\n\nSearch: filter nodes by field:value\n  e.g. tag:character, hop:name:2\n\nTag Display:\n  Node = show tags as nodes\n  Enclosure = show tags as convex hull enclosures",
  "help.groups": "Color-coding rules for nodes\n  Assign colors to nodes matching a query\n  e.g. tag:character → red\n\nCluster group rules are in the\n\"Cluster Arrangement\" section",
  "help.nodeRules": "Control spacing and gravity for nodes matching a query.\n\nquery: target node query (*, tag:character, etc.)\nSpacing: distance multiplier between nodes\nGravity: directional pull (angle and strength)",
  "help.clusterArrangement": "Controls cluster arrangement in Force layout.\n\nPattern: how groups are arranged\nNode spacing: distance between nodes within a group\nGroup size/spacing: group scale and distance\nEdge bundle: curvature of inter-cluster edges (0=straight, 1=strong)\nSort: node ordering within groups",
  "help.pluginSettings": "Plugin-wide settings. Changes apply immediately.\n\nMetadata fields: frontmatter field names for graph relations (comma-separated)\nColor field: field for automatic node coloring\nGroup field: field for concentric/sunburst grouping\nEnclosure min ratio: minimum group size for enclosures",
  "help.ontology": "Define semantic relationships between notes.\n\nForward/Reverse pairs let you traverse relationships in both directions.\n  Inheritance (is-a): parent-child hierarchy\n  Aggregation (has-a): containment/composition\n  Sequence: ordered chains (next/prev)\n  Similar/Sibling: peer relationships\n\nTag Hierarchy: #a/b automatically creates inheritance edges from parent to child tags.",
  "help.customMappings": "Map custom frontmatter fields to ontology relation types.\n\nUseful for ExcaliBrain compatibility or custom field names.\ne.g. 'up' → is-a, 'contains' → has-a",
  "help.tagRelations": "Define explicit relationships between tags.\n\ne.g. #character is-a #entity\nThese create edges between all notes sharing these tags.",
  "help.exprReference": "── Expression Reference ──\n\nVariables:\n  t = normalized position (0–1)\n  i = node index (0, 1, 2, ...)\n  n = total node count in group\n  v = raw axis source value\n\nBuilt-in constants:\n  pi (π), e, tau (τ=2π)\n  Greek letters: α→a β→b θ→t π→pi τ→tau\n\nUser-defined constants:\n  Add via the Constants section below.\n  Use any single letter (a–z) in expressions.\n  Filled Polygon preset:\n    k = number of sides (3–∞)\n    d = density (0.5=uniform, >0.5=sparse center)\n\nFunctions:\n  sin  cos  tan  sqrt  abs\n  log  exp  floor  ceil\n  min(a,b)  max(a,b)  pow(a,b)  atan2(y,x)\n\nOperators:\n  +  -  *  /  % (mod)  ^ (power)\n  Implicit ×: 2t = 2*t, πr² = pi*r^2\n\nSources (FUNC syntax):\n  index, degree, folder, tag:?, hop:name:3\n\nTransforms (FUNC syntax):\n  LINEAR, BIN, STACK, GOLDEN, EVEN, DATE_INDEX\n\nCurves:\n  ARCHIMEDEAN, ROSE, FERMAT, LISSAJOUS,\n  HYPOTROCHOID, EPITROCHOID, BUTTERFLY",
};

const helpJa: TranslationMap = {
  "help.filter": "グラフに表示するノードとエッジを制御します。\n\n検索: field:value でノードをフィルタ\n  例: tag:character, hop:名前:2\n\nタグ表示:\n  ノード = タグ自体をノードとして表示\n  囲い = タグをノード群の包絡線として表示",
  "help.groups": "ノードの色分けルール\n  クエリ記法でマッチするノードに色を割り当て\n  例: tag:character → 赤色\n\nグループ分けルール（クラスター配置）は\n「クラスター配置」セクションで設定します",
  "help.nodeRules": "クエリにマッチするノードの間隔や重力を個別制御します。\n\nquery: 対象ノードのクエリ (*, tag:character 等)\n間隔: ノード同士の距離の倍率\n重力: 特定方向への引力 (角度と強度)",
  "help.clusterArrangement": "Force レイアウトでのクラスター配置を制御します。\n\n配置パターン: グループの並べ方\nノード間隔: グループ内のノード同士の距離\nグループサイズ/間隔: グループの大きさと距離\nエッジ束ね強度: クラスタ間エッジの曲がり具合（0=直線, 1=強い束ね）\nソート順: グループ内のノードの並び順",
  "help.pluginSettings": "プラグイン全体の設定です。変更は即座に反映されます。\n\nメタデータフィールド: グラフの関係構築に使う frontmatter フィールド名\n色分けフィールド: ノードの自動色分けに使うフィールド\nグループフィールド: 同心円/Sunburst のグループ分けフィールド\n囲い最小比率: 包絡線表示の最小グループサイズ",
  "help.ontology": "ノート間の意味的関係を定義します。\n\n正方向/逆方向のペアで双方向の関係を構築できます。\n  継承 (is-a): 親子階層\n  集約 (has-a): 包含/構成\n  順序: 順番付きチェーン (next/prev)\n  類似/兄弟: 対等な関係\n\nタグ階層: #a/b → 親タグから子タグへ自動で継承エッジ生成",
  "help.customMappings": "カスタムフィールドをオントロジーの関係種別にマッピングします。\n\nExcaliBrain互換や独自フィールド名に便利です。\n例: 'up' → is-a, 'contains' → has-a",
  "help.tagRelations": "タグ間の明示的な関係を定義します。\n\n例: #character is-a #entity\nこれらのタグを持つノート間にエッジが生成されます。",
  "help.exprReference": "── 式リファレンス ──\n\n変数:\n  t = 正規化位置 (0–1)\n  i = ノードインデックス (0, 1, 2, ...)\n  n = グループ内ノード総数\n  v = 軸ソースの生値\n\n組み込み定数:\n  pi (π), e, tau (τ=2π)\n  ギリシャ文字: α→a β→b θ→t π→pi τ→tau\n\nユーザー定義定数:\n  下の「定数」セクションで追加できます。\n  式中で任意の1文字 (a–z) を変数として使用。\n  充填多角形プリセット:\n    k = 辺の数 (3–∞)\n    d = 密度 (0.5=均一, >0.5=中心が疎)\n\n関数:\n  sin  cos  tan  sqrt  abs\n  log  exp  floor  ceil\n  min(a,b)  max(a,b)  pow(a,b)  atan2(y,x)\n\n演算子:\n  +  -  *  /  % (余り)  ^ (べき乗)\n  暗黙の乗算: 2t = 2*t, πr² = pi*r^2\n\nソース (関数書式):\n  index, degree, folder, tag:?, hop:名前:3\n\n変換 (関数書式):\n  LINEAR, BIN, STACK, GOLDEN, EVEN, DATE_INDEX\n\n曲線:\n  ARCHIMEDEAN, ROSE, FERMAT, LISSAJOUS,\n  HYPOTROCHOID, EPITROCHOID, BUTTERFLY",
};

// ---------------------------------------------------------------------------
// Locale detection and t() function
// ---------------------------------------------------------------------------

const translations: Record<string, TranslationMap> = { en, ja };
const helpTranslations: Record<string, TranslationMap> = { en: helpEn, ja: helpJa };

function detectLocale(): string {
  try {
    // Obsidian sets moment locale to match the user's language preference
    const m = (window as any).moment;
    if (m && typeof m.locale === "function") {
      const loc = m.locale();
      if (typeof loc === "string" && loc.startsWith("ja")) return "ja";
    }
  } catch { /* fallback */ }
  try {
    if (navigator.language.startsWith("ja")) return "ja";
  } catch { /* fallback */ }
  return "en";
}

let currentLocale = "en"; // will be set on first call

let initialized = false;
function ensureInit() {
  if (!initialized) {
    currentLocale = detectLocale();
    initialized = true;
  }
}

/**
 * Translate a UI string key.
 * Falls back to English if the key is missing in the current locale.
 */
export function t(key: string): string {
  ensureInit();
  return translations[currentLocale]?.[key] ?? translations.en[key] ?? key;
}

/**
 * Translate a help text key (longer descriptions).
 */
export function tHelp(key: string): string {
  ensureInit();
  return helpTranslations[currentLocale]?.[key] ?? helpTranslations.en[key] ?? key;
}

/**
 * Get current locale code (e.g. "en", "ja").
 */
export function getLocale(): string {
  ensureInit();
  return currentLocale;
}
