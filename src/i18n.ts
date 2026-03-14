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
  "layout.concentric": "Concentric",
  "layout.tree": "Tree",
  "layout.arc": "Arc",
  "layout.sunburst": "Sunburst",
  "layout.timeline": "Timeline",
  "search.placeholder": "Search… hop:name:2",
  "settingsFilter.placeholder": "Filter settings…",
  "search.jumpHint": "Enter to jump to node",
  "search.filterHelp": "Filter syntax:\n• tag:act — exact tag match\n• tag:act* — prefix match (act, act1, action…)\n• tag:*act* — partial match\n• path:folder* — filter by file path\n• category:note — filter by category\n• key:value — match frontmatter field\n\nCombine with operators:\n• tag:a AND tag:b — both must match\n• tag:a OR tag:b — either matches\n• (tag:a OR tag:b) AND path:x*\n• tag:a NOR tag:b — neither matches\n• tag:a XOR tag:b — exactly one matches\n\nSpecial:\n• hop:name:2 — highlight within N hops",

  // --- PanelBuilder: section titles ---
  "section.concentricLayout": "Concentric Layout",
  "section.orbitAdjust": "Orbit Adjustment",
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
  "section.forceStrength": "Force Strength",
  "section.pluginSettings": "Plugin Settings",
  "section.ontology": "Ontology",
  "section.customMappings": "Custom Mappings",
  "section.tagRelations": "Tag Relations",
  "tab.filter": "Filter",
  "tab.display": "Display",
  "tab.layout": "Layout",
  "tab.settings": "Settings",
  "section.layout": "Layout",
  "layout.type": "Layout Type",

  // --- PanelBuilder: concentric layout ---
  "concentric.minRadius": "Min Radius",
  "concentric.radiusStep": "Orbit Spacing",
  "concentric.showOrbitRings": "Show Orbit Rings",
  "concentric.autoRotate": "Auto Rotate",
  "orbit.radius": "Radius",
  "orbit.rotationSpeed": "Rotation Speed",
  "orbit.rotationDirection": "Rotation Direction",
  "orbit.dragHint": "Drag to rotate orbits",

  // --- PanelBuilder: filter ---
  "filter.searchPlaceholder": "Search… hop:name:2",
  "filter.tags": "Tags",
  "filter.attachments": "Attachments",
  "filter.existingOnly": "Existing Files Only",
  "filter.orphans": "Orphans",
  "filter.dataviewQuery": "Dataview filter",
  "filter.dataviewHint": "DQL source (e.g. #tag, \"folder\")",
  "filter.dataviewUnavailable": "Dataview plugin not installed",
  "filter.tagDisplay": "Tag Display",
  "filter.tagDisplay.off": "Hidden",
  "filter.tagDisplay.node": "Node",
  "filter.tagDisplay.enclosure": "Enclosure",

  // --- PanelBuilder: groups ---
  "groups.addGroup": "New Group",

  // --- PanelBuilder: display ---
  "display.arrows": "Arrows",
  "display.nodeColor": "Node Color (Auto)",
  "display.edgeColor": "Edge Color (by Relation)",
  "display.fadeEdges": "Edge Fade (by Degree)",
  "display.textFade": "Text Fade Threshold",
  "display.nodeSize": "Node Size",
  "display.scaleByDegree": "Scale by Degree",
  "display.hoverHops": "Hover Highlight Hops",
  "display.edgeTypeHeading": "Edge Types",
  "display.links": "Links",
  "display.sharedTags": "Shared Tags",
  "display.sharedCategory": "Shared Category",
  "display.semantic": "Semantic (semantic)",
  "display.inheritance": "Inheritance (is-a)",
  "display.aggregation": "Aggregation (has-a)",
  "display.similar": "Similar (similar)",
  "display.sibling": "Sibling (peer)",
  "display.sequence": "Sequence (next/prev)",
  "display.edgeLabels": "Show Edge Labels",
  "display.edgeCardinality": "Cardinality Markers",
  "display.edgeCardinalityDesc": "Show ER-style cardinality on edges",
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
  "display.minimap": "Minimap",
  "display.dotGrid": "Background dot grid",
  "display.syncWithEditor": "Sync with Editor",
  "display.edgeWeightThickness": "Edge Weight (thickness)",
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

  "display.groupBy": "Group by",
  "display.groupNone": "None",
  "display.groupTag": "Tag",
  "display.groupCategory": "Category",
  "display.groupFolder": "Folder",
  "display.groupMinSize": "Min group size",
  "display.groupFilter": "Group filter",
  "display.groupFilterPlaceholder": "e.g. project, daily (empty = all)",

  // --- PanelBuilder: node shapes ---
  "display.nodeShapes": "Node Shapes",
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

  // --- PanelBuilder: gravity coefficients ---
  "gravity.centerGravity": "Center Gravity",
  "gravity.centerGravityDesc": "Per-node center pull multiplier (Force layout)",
  "gravity.repelMultiplier": "Repel Multiplier",
  "gravity.repelMultiplierDesc": "Per-node repulsion multiplier (Force layout)",
  "gravity.interGroupAttraction": "Group Attraction",
  "gravity.interGroupAttractionDesc": "Higher values bring groups closer together",
  "gravity.intraGroupDensity": "Group Density",
  "gravity.intraGroupDensityDesc": "Higher values pack nodes more tightly within groups",

  // --- PanelBuilder: relation colors ---
  "relationColors.changeColor": "Click to change color",

  // --- PanelBuilder: cluster arrangement ---
  "cluster.pattern": "Arrangement Pattern",
  "cluster.spiral": "Spiral",
  "cluster.concentric": "Concentric",
  "cluster.radial": "Radial",
  "cluster.phyllotaxis": "Phyllotaxis",
  "cluster.tree": "Tree",
  "cluster.grid": "Grid",
  "cluster.triangle": "Triangle",
  "cluster.random": "Random",
  "cluster.mountain": "Mountain",
  "cluster.sunburst": "Sunburst",
  "cluster.timeline": "Timeline",
  "cluster.custom": "Custom",
  "coord.axisSourceHint": "e.g. folder, tag:?, degree, hop:name:5",
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
  "force.enclosureSpacing": "Enclosure Spacing",

  // --- PanelBuilder: plugin settings ---
  "settings.metadataFields": "Metadata Fields",
  "settings.colorField": "Color Field",
  "settings.groupField": "Group Field",
  "settings.enclosureMinRatio": "Enclosure Min Ratio",
  "settings.ontologyHeading": "— Ontology —",
  "settings.ontPairInheritance": "Inheritance (is-a)",
  "settings.ontPairAggregation": "Aggregation (has-a)",
  "settings.ontPairSequence": "Sequence",
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
  "preset.heading": "Quick Presets",
  "preset.simple": "Simple",
  "preset.simpleDesc": "Minimal settings — links only, clean view",
  "preset.analysis": "Analysis",
  "preset.analysisDesc": "All edge types, color by relation, scale by degree",
  "preset.creative": "Creative Writing",
  "preset.creativeDesc": "Tags as enclosures, group by tag, semantic edges",

  // --- PanelBuilder: timeline ---
  "section.timeline": "Timeline",
  "timeline.timeKey": "Time Field",
  "timeline.timeKeyHint": "Frontmatter field for time axis (e.g. date, era, turn)",
  "timeline.endKey": "End Time Field",
  "timeline.endKeyHint": "Frontmatter field for duration end (e.g. end-date, end_time)",
  "timeline.showDurationBars": "Show Duration Bars",
  "timeline.orderFields": "Order Fields",
  "timeline.orderFieldsHint": "Comma-separated fields for link-based ordering (next, prev, parent_id, story_order)",
  "timeline.range": "Time Range",
  "coord.system": "Coordinate System",
  "coord.cartesian": "Cartesian (X, Y)",
  "coord.polar": "Polar (r, θ)",
  "coord.property": "Property",
  "coord.propertyKey": "field",
  "coord.perGroup": "Per-group coordinates",
  "coord.range": "range",
  "coord.field": "Field",
  "coord.fieldName": "Field Name",
  "coord.hopFrom": "Hop from (node ID)",
  // --- PanelBuilder: axis transform ---
  "transform.label": "Transform",
  "transform.linear": "Linear",
  "transform.bin": "Bin",
  "transform.dateToIndex": "Date→Index",
  "transform.stackAvoid": "Stack Avoid",
  "transform.goldenAngle": "Golden Angle",
  "transform.evenDivide": "Even Divide",
  "transform.expression": "Expression",
  "transform.curve": "Curve",
  "transform.exprPlaceholder": "e.g. sin(t * pi) * 2",
  "transform.exprError": "Invalid expression",
  "transform.exprValid": "Valid",
  "transform.curveType": "Curve Type",
  "curve.archimedean": "Archimedean Spiral",
  "curve.logarithmic": "Logarithmic Spiral",
  "curve.fermat": "Fermat Spiral",
  "curve.hyperbolic": "Hyperbolic Spiral",
  "curve.cardioid": "Cardioid",
  "curve.rose": "Rose Curve",
  "curve.lissajous": "Lissajous",
  "curve.golden": "Golden Spiral",

  "coord.constants": "Constants",
  "coord.constantsHint": "Define variables for use in expressions (e.g. k=6 sides, d=0.5 density)",
  "coord.addConstant": "+ Add Constant",
  "coord.systemConstants": "Overlap Control",
  "coord.sysBlend": "snap strength",
  "coord.sysOverlapPad": "group padding",
  "coord.sysMinGap": "min node gap",
  "coord.sysRingW": "ring width",
  "coord.sysRingGap": "ring gap",
  "coord.sysHole": "center hole",
  "coord.sysSectorGap": "sector gap",
  "coord.constantKey": "Name",
  "coord.constantValue": "Value",

  "cluster.ringChartMode": "Ring Chart",
  "cluster.ringChartModeDesc": "Display as filled ring chart instead of nodes",
  "cluster.hierarchyEdges": "Use hierarchy edges",
  "cluster.hierarchyEdgesDesc": "Build sunburst from inheritance/aggregation edges",
  "cluster.showGuideLines": "Show Guide Lines",
  "cluster.guideLineMode": "Guide Line Mode",
  "cluster.guideLineMode.shared": "Shared (single axis)",
  "cluster.guideLineMode.perGroup": "Per Group",
  "cluster.showGroupGrid": "Show Group Grid",
  "guide.gridTableMode": "Custom Grid",
  "guide.gridTableModeDesc": "Display custom grid overlay on coordinate layout",
  "guide.gridStyle": "Grid Style",
  "guide.gridStyle.lines": "Lines",
  "guide.gridStyle.table": "Table",
  "guide.gridShowHeaders": "Show Headers",
  "guide.gridShowHeadersDesc": "Show row and column header labels",
  "guide.gridCellShading": "Cell Shading",
  "guide.gridCellShadingDesc": "Shade cells by node density",
  "guide.labelPlacement": "Label Placement",
  "guide.labelPlacementDesc": "Position labels on grid lines or between them",
  "guide.labelOnLine": "On Line (Tick)",
  "guide.labelBetween": "Between (Title)",

  // --- PanelBuilder: node display mode ---
  "display.nodeDisplayMode": "Display Mode",
  "display.nodeDisplayModeDesc": "How nodes are rendered",
  "display.modeNode": "Node (Shape)",
  "display.modeCard": "Card",
  "display.modeDonut": "Donut",
  "display.modeSunburst": "Sunburst Segment",
  "display.cardFields": "Card Fields",
  "display.cardFieldsDesc": "Metadata fields to show on card",
  "display.cardMaxWidth": "Card Width",
  "display.cardShowIcon": "Show Icon",
  "display.cardHeaderStyle": "Card Style",
  "display.cardStylePlain": "Plain",
  "display.cardStyleTable": "Table (ER)",
  "display.donutBreakdown": "Breakdown Field",
  "display.donutBreakdownDesc": "Field for sector breakdown (super nodes)",
  "display.donutInnerRadius": "Inner Radius",
  "display.sunburstArcAngle": "Arc Angle",

  // --- PanelBuilder: shared presets ---
  "preset.export": "Export Preset",
  "preset.import": "Import Preset",
  "preset.exported": "Preset copied to clipboard",
  "preset.importError": "Invalid preset JSON",
  "preset.imported": "Preset applied successfully",
  "preset.importPrompt": "Paste preset JSON below:",

  // --- Toast notifications ---
  "toast.presetApplied": "Applied preset: {name}",
  "toast.pngExported": "PNG exported",
  "toast.pngFailed": "PNG export failed",
  "toast.copiedToClipboard": "Copied to clipboard",
  "toast.clipboardFailed": "Clipboard copy failed",
  "toast.localGraphOn": "Local: {name} ({hops} hops)",
  "toast.localGraphOff": "Global graph",
  "toast.filterResult": "{count} nodes displayed",
  "toast.layoutChanged": "Layout: {name}",

  // --- PanelBuilder: action buttons ---
  "action.save": "Save Settings",
  "action.reset": "Reset",

  // --- PanelBuilder: help ---
  "help.ariaLabel": "Help",

  // --- PanelBuilder: direction ---
  "direction.clockwise": "Clockwise ↻",
  "direction.counterClockwise": "Counter-CW ↺",

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
  "clusterGroup.tag": "Tag",
  "clusterGroup.backlinks": "Backlinks",
  "clusterGroup.nodeType": "Node Type",
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
  "detail.backlinks": "Backlinks",

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

  // --- Error messages ---
  "error.pixiInitFailed": "Graph rendering failed. Your browser may not support WebGL.",
  "error.graphBuildFailed": "Failed to build graph data. Check console for details.",
  "error.layoutFailed": "Layout computation failed. Try a different layout.",

  // --- Setting descriptions (tooltips) ---
  "desc.existingOnly": "Hide notes without files",
  "desc.orphans": "Show/hide unconnected nodes",
  "desc.scaleByDegree": "Scale by connection count",
  "desc.textFade": "Zoom level for label fadeout",
  "desc.hoverHops": "Highlight depth on hover",
  "desc.edgeBundleStrength": "0=straight, 1=fully curved",
  "desc.autoFit": "Auto-spacing from node count",
  "desc.fadeEdges": "Fade less-connected edges",
  "desc.enclosureSpacing": "Hull padding",
  "desc.groupMinSize": "Merge groups smaller than this",

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
};

// ---------------------------------------------------------------------------
// Japanese translations
// ---------------------------------------------------------------------------
const ja: TranslationMap = {
  // --- PanelBuilder: top-level controls ---
  "layout.label": "レイアウト",
  "layout.force": "Force",
  "layout.concentric": "同心円",
  "layout.tree": "ツリー",
  "layout.arc": "アーク",
  "layout.sunburst": "サンバースト",
  "layout.timeline": "タイムライン",
  "search.placeholder": "検索… hop:名前:2",
  "settingsFilter.placeholder": "設定を検索…",
  "search.jumpHint": "Enterでノードにジャンプ",
  "search.filterHelp": "フィルタ構文:\n• tag:act — タグ完全一致\n• tag:act* — 前方一致（act, act1, action…）\n• tag:*act* — 部分一致\n• path:folder* — ファイルパスで絞り込み\n• category:note — カテゴリで絞り込み\n• key:value — フロントマターのフィールドで絞り込み\n\n演算子で組み合わせ:\n• tag:a AND tag:b — 両方一致\n• tag:a OR tag:b — どちらか一致\n• (tag:a OR tag:b) AND path:x*\n• tag:a NOR tag:b — どちらも不一致\n• tag:a XOR tag:b — 片方のみ一致\n\n特殊:\n• hop:名前:2 — N ホップ以内を強調表示",

  // --- PanelBuilder: section titles ---
  "section.concentricLayout": "同心円レイアウト",
  "section.orbitAdjust": "各軌道の調整",
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
  "section.forceStrength": "力の強さ",
  "section.pluginSettings": "プラグイン設定",
  "section.ontology": "オントロジー",
  "section.customMappings": "カスタムマッピング",
  "section.tagRelations": "タグ間の関係",
  "tab.filter": "フィルタ",
  "tab.display": "表示",
  "tab.layout": "レイアウト",
  "tab.settings": "設定",
  "section.layout": "レイアウト",
  "layout.type": "レイアウト種別",

  // --- PanelBuilder: concentric layout ---
  "concentric.minRadius": "最小半径",
  "concentric.radiusStep": "軌道間距離",
  "concentric.showOrbitRings": "軌道リングを表示",
  "concentric.autoRotate": "自動回転",
  "orbit.radius": "半径",
  "orbit.rotationSpeed": "回転速度",
  "orbit.rotationDirection": "回転方向",
  "orbit.dragHint": "ドラッグでも軌道を回転できます",

  // --- PanelBuilder: filter ---
  "filter.searchPlaceholder": "検索… hop:名前:2",
  "filter.tags": "タグ",
  "filter.attachments": "添付書類",
  "filter.existingOnly": "存在するファイルのみ表示",
  "filter.orphans": "オーファン",
  "filter.dataviewQuery": "Dataview フィルター",
  "filter.dataviewHint": "DQLソース (例: #tag, \"folder\")",
  "filter.dataviewUnavailable": "Dataviewプラグイン未インストール",
  "filter.tagDisplay": "タグ表示",
  "filter.tagDisplay.off": "非表示",
  "filter.tagDisplay.node": "ノード",
  "filter.tagDisplay.enclosure": "囲い",

  // --- PanelBuilder: groups ---
  "groups.addGroup": "新規グループ",

  // --- PanelBuilder: display ---
  "display.arrows": "矢印",
  "display.nodeColor": "ノード色（自動）",
  "display.edgeColor": "エッジ色（属性別）",
  "display.fadeEdges": "結線の濃淡（被リンク数）",
  "display.textFade": "テキストフェードの閾値",
  "display.nodeSize": "ノードの大きさ",
  "display.scaleByDegree": "被リンク数でサイズ変更",
  "display.hoverHops": "ホバー強調ホップ数",
  "display.edgeTypeHeading": "結線タイプ",
  "display.links": "リンク",
  "display.sharedTags": "共有タグ",
  "display.sharedCategory": "共有カテゴリ",
  "display.semantic": "意味関係 (semantic)",
  "display.inheritance": "継承 (is-a)",
  "display.aggregation": "集約 (has-a)",
  "display.similar": "類似 (similar)",
  "display.sibling": "兄弟 (sibling)",
  "display.sequence": "順序 (next/prev)",
  "display.edgeLabels": "エッジラベル表示",
  "display.edgeCardinality": "カーディナリティ記号",
  "display.edgeCardinalityDesc": "エッジにER図のカーディナリティを表示",
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
  "display.minimap": "ミニマップ",
  "display.dotGrid": "背景ドットグリッド",
  "display.syncWithEditor": "エディタと同期",
  "display.edgeWeightThickness": "エッジ太さ（重み）",
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

  "display.groupBy": "グルーピング",
  "display.groupNone": "なし",
  "display.groupTag": "タグ",
  "display.groupCategory": "カテゴリ",
  "display.groupFolder": "フォルダ",
  "display.groupMinSize": "最小グループサイズ",
  "display.groupFilter": "グループフィルタ",
  "display.groupFilterPlaceholder": "例: project, daily（空＝全対象）",

  // --- PanelBuilder: node shapes ---
  "display.nodeShapes": "ノード形状",
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

  // --- PanelBuilder: gravity coefficients ---
  "gravity.centerGravity": "中心引力",
  "gravity.centerGravityDesc": "ノード個別の中心引力係数（Forceレイアウト用）",
  "gravity.repelMultiplier": "反発係数",
  "gravity.repelMultiplierDesc": "ノード個別の反発力係数（Forceレイアウト用）",
  "gravity.interGroupAttraction": "グループ間引力",
  "gravity.interGroupAttractionDesc": "値が大きいほどグループ同士が近づく",
  "gravity.intraGroupDensity": "グループ内密度",
  "gravity.intraGroupDensityDesc": "値が大きいほどグループ内のノードが密集する",

  // --- PanelBuilder: relation colors ---
  "relationColors.changeColor": "クリックで色を変更",

  // --- PanelBuilder: cluster arrangement ---
  "cluster.pattern": "配置パターン",
  "cluster.spiral": "螺旋",
  "cluster.concentric": "同心円",
  "cluster.radial": "放射",
  "cluster.phyllotaxis": "フィロタキシス",
  "cluster.tree": "ツリー",
  "cluster.grid": "正方形",
  "cluster.triangle": "三角形",
  "cluster.random": "無秩序",
  "cluster.mountain": "マウンテン",
  "cluster.sunburst": "サンバースト",
  "cluster.timeline": "タイムライン",
  "cluster.custom": "カスタム",
  "coord.axisSourceHint": "例: folder, tag:?, degree, hop:名前:5",
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
  "force.enclosureSpacing": "囲い間隔",

  // --- PanelBuilder: plugin settings ---
  "settings.metadataFields": "メタデータフィールド",
  "settings.colorField": "色分けフィールド",
  "settings.groupField": "グループフィールド",
  "settings.enclosureMinRatio": "囲い最小比率",
  "settings.ontologyHeading": "― オントロジー ―",
  "settings.ontPairInheritance": "継承 (is-a)",
  "settings.ontPairAggregation": "集約 (has-a)",
  "settings.ontPairSequence": "順序",
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
  "preset.heading": "クイックプリセット",
  "preset.simple": "シンプル",
  "preset.simpleDesc": "最小限の設定 — リンクのみ、すっきり表示",
  "preset.analysis": "分析",
  "preset.analysisDesc": "全エッジ種別、属性色分け、被リンク数でサイズ変更",
  "preset.creative": "創作",
  "preset.creativeDesc": "タグ囲い、タグでグループ化、意味関係エッジ",

  // --- PanelBuilder: timeline ---
  "section.timeline": "タイムライン",
  "timeline.timeKey": "時間フィールド",
  "timeline.timeKeyHint": "時間軸に使うfrontmatterフィールド（例: date, era, turn）",
  "timeline.endKey": "終了時間フィールド",
  "timeline.endKeyHint": "期間の終了を表すfrontmatterフィールド（例: end-date, end_time）",
  "timeline.showDurationBars": "期間バーを表示",
  "timeline.orderFields": "順序フィールド",
  "timeline.orderFieldsHint": "リンクベース順序推論用フィールド（カンマ区切り: next, prev, parent_id, story_order）",
  "timeline.range": "表示期間",
  "coord.system": "座標形式",
  "coord.cartesian": "直交座標 (X, Y)",
  "coord.polar": "極座標 (r, θ)",
  "coord.property": "プロパティ",
  "coord.propertyKey": "フィールド",
  "coord.perGroup": "グループごとに座標形成",
  "coord.range": "範囲",
  "coord.field": "フィールド属性",
  "coord.fieldName": "フィールド名",
  "coord.hopFrom": "ホップ元（ノードID）",
  // --- PanelBuilder: axis transform ---
  "transform.label": "変換",
  "transform.linear": "線形",
  "transform.bin": "ビン分割",
  "transform.dateToIndex": "日付→インデックス",
  "transform.stackAvoid": "重なり回避",
  "transform.goldenAngle": "黄金角",
  "transform.evenDivide": "均等分割",
  "transform.expression": "数式",
  "transform.curve": "曲線",
  "transform.exprPlaceholder": "例: sin(t * pi) * 2",
  "transform.exprError": "無効な数式",
  "transform.exprValid": "有効",
  "transform.curveType": "曲線タイプ",
  "curve.archimedean": "アルキメデスの螺旋",
  "curve.logarithmic": "対数螺旋",
  "curve.fermat": "フェルマーの螺旋",
  "curve.hyperbolic": "双曲螺旋",
  "curve.cardioid": "カージオイド",
  "curve.rose": "バラ曲線",
  "curve.lissajous": "リサージュ",
  "curve.golden": "黄金螺旋",

  "coord.constants": "定数",
  "coord.constantsHint": "数式で使う変数を定義 (例: k=6 辺数, d=0.5 密度)",
  "coord.addConstant": "+ 定数を追加",
  "coord.systemConstants": "重複制御",
  "coord.sysBlend": "スナップ強度",
  "coord.sysOverlapPad": "グループ余白",
  "coord.sysMinGap": "最小ノード間隔",
  "coord.sysRingW": "リング幅",
  "coord.sysRingGap": "リング間隔",
  "coord.sysHole": "中心穴",
  "coord.sysSectorGap": "セクター間隔",
  "coord.constantKey": "名前",
  "coord.constantValue": "値",

  "cluster.ringChartMode": "リングチャート",
  "cluster.ringChartModeDesc": "ノードの代わりにリングチャートで表示",
  "cluster.hierarchyEdges": "階層エッジを使用",
  "cluster.hierarchyEdgesDesc": "継承/集約エッジからサンバーストを構築",
  "cluster.showGuideLines": "ガイドラインを表示",
  "cluster.guideLineMode": "ガイドラインモード",
  "cluster.guideLineMode.shared": "共通（単一軸）",
  "cluster.guideLineMode.perGroup": "グループ別",
  "cluster.showGroupGrid": "グループグリッドを表示",
  "guide.gridTableMode": "カスタムグリッド",
  "guide.gridTableModeDesc": "座標レイアウトにカスタムグリッドを表示",
  "guide.gridStyle": "グリッドスタイル",
  "guide.gridStyle.lines": "ライン",
  "guide.gridStyle.table": "テーブル",
  "guide.gridShowHeaders": "ヘッダー表示",
  "guide.gridShowHeadersDesc": "行・列のヘッダーラベルを表示",
  "guide.gridCellShading": "セルシェーディング",
  "guide.gridCellShadingDesc": "ノード密度でセルを着色",
  "guide.labelPlacement": "ラベル配置",
  "guide.labelPlacementDesc": "グリッド線上か間にラベルを配置",
  "guide.labelOnLine": "線上（目盛り）",
  "guide.labelBetween": "線間（タイトル）",

  // --- PanelBuilder: node display mode ---
  "display.nodeDisplayMode": "表示モード",
  "display.nodeDisplayModeDesc": "ノードの表示方式",
  "display.modeNode": "ノード（図形）",
  "display.modeCard": "カード",
  "display.modeDonut": "ドーナツ",
  "display.modeSunburst": "サンバーストセグメント",
  "display.cardFields": "カード表示フィールド",
  "display.cardFieldsDesc": "カードに表示するメタデータ",
  "display.cardMaxWidth": "カード幅",
  "display.cardShowIcon": "アイコン表示",
  "display.cardHeaderStyle": "カードスタイル",
  "display.cardStylePlain": "シンプル",
  "display.cardStyleTable": "テーブル（ER図）",
  "display.donutBreakdown": "内訳フィールド",
  "display.donutBreakdownDesc": "セクター内訳に使用するフィールド",
  "display.donutInnerRadius": "内径",
  "display.sunburstArcAngle": "弧の角度",

  // --- PanelBuilder: shared presets ---
  "preset.export": "プリセットをエクスポート",
  "preset.import": "プリセットをインポート",
  "preset.exported": "プリセットをクリップボードにコピーしました",
  "preset.importError": "無効なプリセット JSON です",
  "preset.imported": "プリセットを適用しました",
  "preset.importPrompt": "プリセット JSON を貼り付けてください:",

  // --- Toast notifications ---
  "toast.presetApplied": "プリセット適用: {name}",
  "toast.pngExported": "PNG をエクスポートしました",
  "toast.pngFailed": "PNG エクスポート失敗",
  "toast.copiedToClipboard": "クリップボードにコピーしました",
  "toast.clipboardFailed": "クリップボードコピー失敗",
  "toast.localGraphOn": "ローカル: {name} ({hops} ホップ)",
  "toast.localGraphOff": "グローバルグラフ",
  "toast.filterResult": "{count} ノードを表示中",
  "toast.layoutChanged": "レイアウト: {name}",

  // --- PanelBuilder: action buttons ---
  "action.save": "設定を保存",
  "action.reset": "初期化",

  // --- PanelBuilder: help ---
  "help.ariaLabel": "ヘルプ",

  // --- PanelBuilder: direction ---
  "direction.clockwise": "時計回り ↻",
  "direction.counterClockwise": "反時計回り ↺",

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
  "clusterGroup.tag": "タグ",
  "clusterGroup.backlinks": "被リンク数",
  "clusterGroup.nodeType": "ノードタイプ",
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
  "detail.backlinks": "バックリンク",

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

  // --- Error messages ---
  "error.pixiInitFailed": "グラフの描画に失敗しました。お使いのブラウザがWebGLに対応していない可能性があります。",
  "error.graphBuildFailed": "グラフデータの構築に失敗しました。コンソールで詳細を確認してください。",
  "error.layoutFailed": "レイアウト計算に失敗しました。別のレイアウトをお試しください。",

  // --- Setting descriptions (tooltips) ---
  "desc.existingOnly": "ファイルのないノートを非表示",
  "desc.orphans": "接続のないノードの表示/非表示",
  "desc.scaleByDegree": "接続数でサイズ拡縮",
  "desc.textFade": "ラベルが消えるズームレベル",
  "desc.hoverHops": "ホバー時の強調範囲",
  "desc.edgeBundleStrength": "0=直線, 1=完全に束ねる",
  "desc.autoFit": "ノード数から間隔を自動計算",
  "desc.fadeEdges": "接続の少ないエッジを薄く",
  "desc.enclosureSpacing": "包絡線のパディング",
  "desc.groupMinSize": "これ未満のグループを統合",

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
};

// ---------------------------------------------------------------------------
// Help text translations (separate map to keep main map lightweight)
// ---------------------------------------------------------------------------

const helpEn: TranslationMap = {
  "help.filter": "Controls which nodes and edges appear in the graph.\n\nSearch: filter nodes by field:value\n  e.g. tag:character, hop:name:2\n\nTag Display:\n  Node = show tags as nodes\n  Enclosure = show tags as convex hull enclosures",
  "help.groups": "Color-coding rules for nodes\n  Assign colors to nodes matching a query\n  e.g. tag:character → red\n\nCluster group rules are in the\n\"Cluster Arrangement\" section",
  "help.display": "Adjust graph appearance.\n\nArrows: show direction arrows on edges\nNode color: auto-color by category field\nEdge color: color by relation type\nText fade: label fade threshold when zooming out\nHover highlight: how many hops to highlight on hover\n\nEdge Types: toggle visibility by type",
  "help.nodeRules": "Control spacing and gravity for nodes matching a query.\n\nquery: target node query (*, tag:character, etc.)\nSpacing: distance multiplier between nodes\nGravity: directional pull (angle and strength)",
  "help.clusterArrangement": "Controls cluster arrangement in Force layout.\n\nPattern: how groups are arranged\nNode spacing: distance between nodes within a group\nGroup size/spacing: group scale and distance\nEdge bundle: curvature of inter-cluster edges (0=straight, 1=strong)\nSort: node ordering within groups",
  "help.forceStrength": "Adjust force simulation parameters.\n\nCenter force: pull nodes toward center\nRepel force: repulsion distance between nodes\nLink force: edge attraction strength\nLink distance: target edge length\nEnclosure spacing: tag enclosure padding",
  "help.pluginSettings": "Plugin-wide settings. Changes apply immediately.\n\nMetadata fields: frontmatter field names for graph relations (comma-separated)\nColor field: field for automatic node coloring\nGroup field: field for concentric/sunburst grouping\nEnclosure min ratio: minimum group size for enclosures",
  "help.ontology": "Define semantic relationships between notes.\n\nForward/Reverse pairs let you traverse relationships in both directions.\n  Inheritance (is-a): parent-child hierarchy\n  Aggregation (has-a): containment/composition\n  Sequence: ordered chains (next/prev)\n  Similar/Sibling: peer relationships\n\nTag Hierarchy: #a/b automatically creates inheritance edges from parent to child tags.",
  "help.customMappings": "Map custom frontmatter fields to ontology relation types.\n\nUseful for ExcaliBrain compatibility or custom field names.\ne.g. 'up' → is-a, 'contains' → has-a",
  "help.tagRelations": "Define explicit relationships between tags.\n\ne.g. #character is-a #entity\nThese create edges between all notes sharing these tags.",
  "help.concentricLayout": "Adjust concentric layout parameters.\n\nMin radius: inner orbit radius\nOrbit spacing: distance between orbits\nOrbit rings: show/hide orbit circles\nAuto rotate: enable orbital animation",
  "help.exprReference": "── Expression Reference ──\n\nVariables:\n  t = normalized position (0–1)\n  i = node index (0, 1, 2, ...)\n  n = total node count in group\n  v = raw axis source value\n\nBuilt-in constants:\n  pi (π), e, tau (τ=2π)\n  Greek letters: α→a β→b θ→t π→pi τ→tau\n\nUser-defined constants:\n  Add via the Constants section below.\n  Use any single letter (a–z) in expressions.\n  Filled Polygon preset:\n    k = number of sides (3–∞)\n    d = density (0.5=uniform, >0.5=sparse center)\n\nFunctions:\n  sin  cos  tan  sqrt  abs\n  log  exp  floor  ceil\n  min(a,b)  max(a,b)  pow(a,b)  atan2(y,x)\n\nOperators:\n  +  -  *  /  % (mod)  ^ (power)\n  Implicit ×: 2t = 2*t, πr² = pi*r^2\n\nSources (FUNC syntax):\n  index, degree, folder, tag:?, hop:name:3\n\nTransforms (FUNC syntax):\n  LINEAR, BIN, STACK, GOLDEN, EVEN, DATE_INDEX\n\nCurves:\n  ARCHIMEDEAN, ROSE, FERMAT, LISSAJOUS,\n  HYPOTROCHOID, EPITROCHOID, BUTTERFLY",
};

const helpJa: TranslationMap = {
  "help.filter": "グラフに表示するノードとエッジを制御します。\n\n検索: field:value でノードをフィルタ\n  例: tag:character, hop:名前:2\n\nタグ表示:\n  ノード = タグ自体をノードとして表示\n  囲い = タグをノード群の包絡線として表示",
  "help.groups": "ノードの色分けルール\n  クエリ記法でマッチするノードに色を割り当て\n  例: tag:character → 赤色\n\nグループ分けルール（クラスター配置）は\n「クラスター配置」セクションで設定します",
  "help.display": "グラフの見た目を調整します。\n\n矢印: エッジに方向を示す矢印を表示\nノード色: category フィールドで自動色分け\nエッジ色: 関係種別ごとに色分け\nテキストフェード: ズームアウト時のラベル消失閾値\nホバー強調: マウスオーバー時に何ホップ先まで強調するか\n\n結線タイプ: 種別ごとにエッジの表示/非表示を切り替え",
  "help.nodeRules": "クエリにマッチするノードの間隔や重力を個別制御します。\n\nquery: 対象ノードのクエリ (*, tag:character 等)\n間隔: ノード同士の距離の倍率\n重力: 特定方向への引力 (角度と強度)",
  "help.clusterArrangement": "Force レイアウトでのクラスター配置を制御します。\n\n配置パターン: グループの並べ方\nノード間隔: グループ内のノード同士の距離\nグループサイズ/間隔: グループの大きさと距離\nエッジ束ね強度: クラスタ間エッジの曲がり具合（0=直線, 1=強い束ね）\nソート順: グループ内のノードの並び順",
  "help.forceStrength": "力学シミュレーションのパラメータを調整します。\n\n中心力: ノードを中心に引き寄せる力\n反発力: ノード同士の反発距離\nリンクの力: エッジによる引力強度\nリンク距離: エッジの目標長さ\n囲い間隔: タグ包絡線のパディング",
  "help.pluginSettings": "プラグイン全体の設定です。変更は即座に反映されます。\n\nメタデータフィールド: グラフの関係構築に使う frontmatter フィールド名\n色分けフィールド: ノードの自動色分けに使うフィールド\nグループフィールド: 同心円/Sunburst のグループ分けフィールド\n囲い最小比率: 包絡線表示の最小グループサイズ",
  "help.ontology": "ノート間の意味的関係を定義します。\n\n正方向/逆方向のペアで双方向の関係を構築できます。\n  継承 (is-a): 親子階層\n  集約 (has-a): 包含/構成\n  順序: 順番付きチェーン (next/prev)\n  類似/兄弟: 対等な関係\n\nタグ階層: #a/b → 親タグから子タグへ自動で継承エッジ生成",
  "help.customMappings": "カスタムフィールドをオントロジーの関係種別にマッピングします。\n\nExcaliBrain互換や独自フィールド名に便利です。\n例: 'up' → is-a, 'contains' → has-a",
  "help.tagRelations": "タグ間の明示的な関係を定義します。\n\n例: #character is-a #entity\nこれらのタグを持つノート間にエッジが生成されます。",
  "help.concentricLayout": "同心円レイアウトのパラメータを調整します。\n\n最小半径: 最も内側の軌道の半径\n軌道間距離: 軌道同士の間隔\n軌道リング: 軌道の円を表示/非表示\n自動回転: 軌道アニメーションの有効化",
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
