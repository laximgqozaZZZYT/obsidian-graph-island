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
  "search.placeholder": "Search… hop:name:2",
  "search.jumpHint": "Enter to jump to node",

  // --- PanelBuilder: section titles ---
  "section.concentricLayout": "Concentric Layout",
  "section.orbitAdjust": "Orbit Adjustment",
  "section.filter": "Filter",
  "section.groups": "Groups",
  "section.display": "Display",
  "section.nodeRules": "Node Rules",
  "section.relationColors": "Relation Colors",
  "section.clusterArrangement": "Cluster Arrangement",
  "section.forceStrength": "Force Strength",
  "section.pluginSettings": "Plugin Settings",

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
  "display.minimap": "Minimap",
  "display.groupBy": "Group by",
  "display.groupNone": "None",
  "display.groupTag": "Tag",
  "display.groupCategory": "Category",

  // --- PanelBuilder: node rules ---
  "nodeRules.addRule": "Add Rule",
  "nodeRules.spacing": "Spacing",
  "nodeRules.gravity": "Gravity",

  // --- PanelBuilder: relation colors ---
  "relationColors.changeColor": "Click to change color",

  // --- PanelBuilder: cluster arrangement ---
  "cluster.pattern": "Arrangement Pattern",
  "cluster.spiral": "Spiral",
  "cluster.concentric": "Concentric",
  "cluster.tree": "Tree",
  "cluster.grid": "Grid",
  "cluster.triangle": "Triangle",
  "cluster.random": "Random",
  "cluster.mountain": "Mountain",
  "cluster.sunburst": "Sunburst",
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
  "settings.inheritanceFields": "Inheritance Fields (is-a)",
  "settings.aggregationFields": "Aggregation Fields (has-a)",
  "settings.reverseInheritanceFields": "Reverse Inheritance (child/down)",
  "settings.reverseAggregationFields": "Reverse Aggregation (part-of)",
  "settings.similarFields": "Similar Fields",
  "settings.siblingFields": "Sibling Fields (peer)",
  "settings.sequenceFields": "Sequence Fields (next)",
  "settings.reverseSequenceFields": "Reverse Sequence (prev)",
  "settings.tagHierarchy": "Generate Inheritance from Tag Hierarchy",
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
  "toolbar.graphSettings": "Graph Settings",

  // --- Error messages ---
  "error.pixiInitFailed": "Graph rendering failed. Your browser may not support WebGL.",
  "error.graphBuildFailed": "Failed to build graph data. Check console for details.",
  "error.layoutFailed": "Layout computation failed. Try a different layout.",

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
  "search.placeholder": "検索… hop:名前:2",
  "search.jumpHint": "Enterでノードにジャンプ",

  // --- PanelBuilder: section titles ---
  "section.concentricLayout": "同心円レイアウト",
  "section.orbitAdjust": "各軌道の調整",
  "section.filter": "フィルタ",
  "section.groups": "グループ",
  "section.display": "表示",
  "section.nodeRules": "ノードルール",
  "section.relationColors": "属性カラー",
  "section.clusterArrangement": "クラスター配置",
  "section.forceStrength": "力の強さ",
  "section.pluginSettings": "プラグイン設定",

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
  "display.minimap": "ミニマップ",
  "display.groupBy": "グルーピング",
  "display.groupNone": "なし",
  "display.groupTag": "タグ",
  "display.groupCategory": "カテゴリ",

  // --- PanelBuilder: node rules ---
  "nodeRules.addRule": "ルール追加",
  "nodeRules.spacing": "間隔",
  "nodeRules.gravity": "重力",

  // --- PanelBuilder: relation colors ---
  "relationColors.changeColor": "クリックで色を変更",

  // --- PanelBuilder: cluster arrangement ---
  "cluster.pattern": "配置パターン",
  "cluster.spiral": "螺旋",
  "cluster.concentric": "同心円",
  "cluster.tree": "ツリー",
  "cluster.grid": "正方形",
  "cluster.triangle": "三角形",
  "cluster.random": "無秩序",
  "cluster.mountain": "マウンテン",
  "cluster.sunburst": "サンバースト",
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
  "settings.inheritanceFields": "継承フィールド (is-a)",
  "settings.aggregationFields": "集約フィールド (has-a)",
  "settings.reverseInheritanceFields": "逆方向の継承 (child/down)",
  "settings.reverseAggregationFields": "逆方向の集約 (part-of)",
  "settings.similarFields": "類似フィールド",
  "settings.siblingFields": "兄弟フィールド (sibling)",
  "settings.sequenceFields": "順序フィールド (next)",
  "settings.reverseSequenceFields": "逆順序 (prev)",
  "settings.tagHierarchy": "タグ階層から継承エッジ生成",
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
  "toolbar.graphSettings": "グラフ設定",

  // --- Error messages ---
  "error.pixiInitFailed": "グラフの描画に失敗しました。お使いのブラウザがWebGLに対応していない可能性があります。",
  "error.graphBuildFailed": "グラフデータの構築に失敗しました。コンソールで詳細を確認してください。",
  "error.layoutFailed": "レイアウト計算に失敗しました。別のレイアウトをお試しください。",

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
  "help.pluginSettings": "Plugin-wide settings. Changes apply immediately.\n\nMetadata fields: frontmatter field names for graph relations (comma-separated)\nColor field: field for automatic node coloring\nGroup field: field for concentric/sunburst grouping\nEnclosure min ratio: minimum group size for enclosures\n\nOntology:\n  Inheritance (is-a): parent-child fields\n  Aggregation (has-a): containment fields\n  Similar: relatedness fields\n  Tag hierarchy: #a/b → auto inheritance edge",
  "help.concentricLayout": "Adjust concentric layout parameters.\n\nMin radius: inner orbit radius\nOrbit spacing: distance between orbits\nOrbit rings: show/hide orbit circles\nAuto rotate: enable orbital animation",
};

const helpJa: TranslationMap = {
  "help.filter": "グラフに表示するノードとエッジを制御します。\n\n検索: field:value でノードをフィルタ\n  例: tag:character, hop:名前:2\n\nタグ表示:\n  ノード = タグ自体をノードとして表示\n  囲い = タグをノード群の包絡線として表示",
  "help.groups": "ノードの色分けルール\n  クエリ記法でマッチするノードに色を割り当て\n  例: tag:character → 赤色\n\nグループ分けルール（クラスター配置）は\n「クラスター配置」セクションで設定します",
  "help.display": "グラフの見た目を調整します。\n\n矢印: エッジに方向を示す矢印を表示\nノード色: category フィールドで自動色分け\nエッジ色: 関係種別ごとに色分け\nテキストフェード: ズームアウト時のラベル消失閾値\nホバー強調: マウスオーバー時に何ホップ先まで強調するか\n\n結線タイプ: 種別ごとにエッジの表示/非表示を切り替え",
  "help.nodeRules": "クエリにマッチするノードの間隔や重力を個別制御します。\n\nquery: 対象ノードのクエリ (*, tag:character 等)\n間隔: ノード同士の距離の倍率\n重力: 特定方向への引力 (角度と強度)",
  "help.clusterArrangement": "Force レイアウトでのクラスター配置を制御します。\n\n配置パターン: グループの並べ方\nノード間隔: グループ内のノード同士の距離\nグループサイズ/間隔: グループの大きさと距離\nエッジ束ね強度: クラスタ間エッジの曲がり具合（0=直線, 1=強い束ね）\nソート順: グループ内のノードの並び順",
  "help.forceStrength": "力学シミュレーションのパラメータを調整します。\n\n中心力: ノードを中心に引き寄せる力\n反発力: ノード同士の反発距離\nリンクの力: エッジによる引力強度\nリンク距離: エッジの目標長さ\n囲い間隔: タグ包絡線のパディング",
  "help.pluginSettings": "プラグイン全体の設定です。変更は即座に反映されます。\n\nメタデータフィールド: グラフの関係構築に使う frontmatter フィールド名（カンマ区切り）\n色分けフィールド: ノードの自動色分けに使うフィールド\nグループフィールド: 同心円/Sunburst のグループ分けフィールド\n囲い最小比率: 包絡線表示の最小グループサイズ\n\nオントロジー:\n  継承 (is-a): 親子関係のフィールド\n  集約 (has-a): 包含関係のフィールド\n  類似: 関連性のフィールド\n  タグ階層: #a/b → 自動で継承エッジ生成",
  "help.concentricLayout": "同心円レイアウトのパラメータを調整します。\n\n最小半径: 最も内側の軌道の半径\n軌道間距離: 軌道同士の間隔\n軌道リング: 軌道の円を表示/非表示\n自動回転: 軌道アニメーションの有効化",
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
