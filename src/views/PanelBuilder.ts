import type { LayoutType, GraphNode, ShellInfo, DirectionalGravityRule, ClusterArrangement, ClusterGroupBy, ClusterGroupRule, GroupRule, SortRule, SortKey, SortOrder, NodeRule, GraphViewsSettings } from "../types";
import { DEFAULT_COLORS } from "../types";
import { repositionShell } from "../layouts/concentric";
import type { QueryExpression, BoolOp } from "../utils/query-expr";
import { parseQueryExpr, serializeExpr } from "../utils/query-expr";
import { setIcon } from "obsidian";

// ---------------------------------------------------------------------------
// Panel state (shared with GraphViewContainer)
// ---------------------------------------------------------------------------
export interface PanelState {
  showTags: boolean;
  showAttachments: boolean;
  existingOnly: boolean;
  showOrphans: boolean;
  showArrows: boolean;
  textFadeThreshold: number;
  nodeSize: number;
  scaleByDegree: boolean;
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
  concentricMinRadius: number;
  concentricRadiusStep: number;
  showOrbitRings: boolean;
  orbitAutoRotate: boolean;
  groups: GroupRule[];
  searchQuery: string;
  colorEdgesByRelation: boolean;
  colorNodesByCategory: boolean;
  showInheritance: boolean;
  showAggregation: boolean;
  showTagNodes: boolean;
  tagDisplay: "node" | "enclosure";
  showSimilar: boolean;
  enclosureSpacing: number;
  directionalGravityRules: DirectionalGravityRule[];
  hoverHops: number;
  commonQueries: { query: string; recursive: boolean }[];
  clusterGroupRules: ClusterGroupRule[];
  clusterArrangement: ClusterArrangement;
  clusterNodeSpacing: number;
  clusterGroupScale: number;
  clusterGroupSpacing: number;
  fadeEdgesByDegree: boolean;
  edgeBundleStrength: number;
  sortRules: SortRule[];
  nodeRules: NodeRule[];
}

export const DEFAULT_PANEL: PanelState = {
  showTags: true,
  showAttachments: false,
  existingOnly: false,
  showOrphans: true,
  showArrows: false,
  textFadeThreshold: 0.5,
  nodeSize: 8,
  scaleByDegree: true,
  centerForce: 0.03,
  repelForce: 200,
  linkForce: 0.01,
  linkDistance: 100,
  concentricMinRadius: 50,
  concentricRadiusStep: 60,
  showOrbitRings: true,
  orbitAutoRotate: true,
  groups: [],
  searchQuery: "",
  colorEdgesByRelation: true,
  colorNodesByCategory: true,
  showInheritance: true,
  showAggregation: true,
  showTagNodes: true,
  tagDisplay: "enclosure" as const,
  showSimilar: false,
  enclosureSpacing: 1.5,
  directionalGravityRules: [],
  hoverHops: 1,
  commonQueries: [],
  clusterGroupRules: [],
  clusterArrangement: "spiral" as ClusterArrangement,
  clusterNodeSpacing: 3.0,
  clusterGroupScale: 3.0,
  clusterGroupSpacing: 2.0,
  fadeEdgesByDegree: false,
  edgeBundleStrength: 0.65,
  sortRules: [{ key: "degree" as SortKey, order: "desc" as SortOrder }],
  nodeRules: [],
};

// ---------------------------------------------------------------------------
// Callbacks — operations the panel requests from the main view
// ---------------------------------------------------------------------------
export interface PanelCallbacks {
  doRender(): void;
  markDirty(): void;
  updateForces(): void;
  applySearch(): void;
  applyTextFade(): void;
  applyDirectionalGravityForce(): void;
  applyNodeRules(): void;
  startOrbitAnimation(): void;
  stopOrbitAnimation(): void;
  wakeRenderLoop(): void;
  rebuildPanel(): void;
  invalidateData(): void;       // sets rawData = null then doRender
  restartSimulation(alpha: number): void;
  applyClusterForce(): void;
  collectFieldSuggestions(): string[];
  collectValueSuggestions(field: string): string[];
  saveGroupPreset(): void;
  resetPanel(): void;
}

// ---------------------------------------------------------------------------
// Read-only context the panel needs from the view
// ---------------------------------------------------------------------------
export interface PanelContext {
  currentLayout: LayoutType;
  setLayout(layout: LayoutType): void;
  shells: ShellInfo[];
  pixiNodes: Map<string, { data: GraphNode }>;
  relationColors: Map<string, string>;
  simulation: unknown | null;  // only used for null-check
  settings: GraphViewsSettings;
  saveSettings(): void;
}

// ---------------------------------------------------------------------------
// PanelBuilder
// ---------------------------------------------------------------------------
export function buildPanel(
  panelEl: HTMLElement,
  panel: PanelState,
  ctx: PanelContext,
  cb: PanelCallbacks,
): void {
  panelEl.empty();

  buildSection(panelEl, "グラフの種類", (body) => {
    const select = body.createEl("select", { cls: "ngp-select" });
    const layouts: { type: LayoutType; label: string }[] = [
      { type: "force", label: "Force" },
      { type: "concentric", label: "Concentric" },
      { type: "tree", label: "Tree" },
      { type: "arc", label: "Arc" },
      { type: "sunburst", label: "Sunburst" },
    ];
    for (const l of layouts) {
      const opt = select.createEl("option", { text: l.label, value: l.type });
      if (l.type === ctx.currentLayout) opt.selected = true;
    }
    select.addEventListener("change", () => {
      ctx.setLayout(select.value as LayoutType);
      cb.rebuildPanel();
      cb.doRender();
    });
  }, "グラフのレイアウトアルゴリズムを選択します。\n\nForce: 力学モデル（クラスター配置対応）\nConcentric: 同心円配置\nTree: 階層ツリー\nArc: 弧状配置\nSunburst: 放射状階層配置");

  if (ctx.currentLayout === "concentric") {
    buildSection(panelEl, "同心円レイアウト", (body) => {
      addSlider(body, "最小半径", 10, 200, 5, panel.concentricMinRadius, (v) => { panel.concentricMinRadius = v; cb.doRender(); });
      addSlider(body, "軌道間距離", 10, 200, 5, panel.concentricRadiusStep, (v) => { panel.concentricRadiusStep = v; cb.doRender(); });
      addToggle(body, "軌道リングを表示", panel.showOrbitRings, (v) => { panel.showOrbitRings = v; cb.markDirty(); });
      addToggle(body, "自動回転", panel.orbitAutoRotate, (v) => {
        panel.orbitAutoRotate = v;
        if (v) { cb.startOrbitAnimation(); } else { cb.stopOrbitAnimation(); }
      });
    });
    if (ctx.shells.length > 0) {
      buildSection(panelEl, "各軌道の調整", (body) => {
        ctx.shells.forEach((shell, i) => {
          if (i === 0 && shell.nodeIds.length === 1) return;
          const label = `軌道 ${i} (${shell.nodeIds.length}ノード)`;
          body.createEl("div", { cls: "ngp-orbit-label", text: label });
          addSlider(body, "半径", 10, 500, 5, shell.radius, (v) => {
            shell.radius = v;
            const nodeMap = new Map<string, GraphNode>();
            for (const pn of ctx.pixiNodes.values()) nodeMap.set(pn.data.id, pn.data);
            repositionShell(shell, nodeMap);
            cb.markDirty();
          });
          addSlider(body, "回転速度", 0, 2, 0.05, shell.rotationSpeed, (v) => {
            shell.rotationSpeed = v;
          });
          addDirectionToggle(body, "回転方向", shell.rotationDirection, (v) => {
            shell.rotationDirection = v;
          });
        });
        body.createEl("p", { cls: "ngp-hint", text: "ドラッグでも軌道を回転できます" });
      });
    }
  }

  buildSection(panelEl, "フィルタ", (body) => {
    const search = body.createEl("input", { cls: "ngp-search", type: "text", placeholder: "検索… hop:名前:2" });
    search.value = panel.searchQuery;
    search.addEventListener("input", () => { panel.searchQuery = search.value; cb.applySearch(); });
    attachQueryHint(search, (field) => cb.collectValueSuggestions(field));
    addToggle(body, "タグ", panel.showTags, (v) => { panel.showTags = v; cb.invalidateData(); });
    addToggle(body, "添付書類", panel.showAttachments, (v) => { panel.showAttachments = v; cb.invalidateData(); });
    addToggle(body, "存在するファイルのみ表示", panel.existingOnly, (v) => { panel.existingOnly = v; cb.invalidateData(); });
    addToggle(body, "オーファン", panel.showOrphans, (v) => { panel.showOrphans = v; cb.invalidateData(); });
    addSelect(body, "タグ表示", [
      { value: "off", label: "非表示" },
      { value: "node", label: "ノード" },
      { value: "enclosure", label: "囲い" },
    ], !panel.showTagNodes ? "off" : panel.tagDisplay, (v) => {
      panel.showTagNodes = v !== "off";
      panel.tagDisplay = v === "enclosure" ? "enclosure" : "node";
      cb.invalidateData();
    });
    addToggle(body, "継承エッジ (is-a)", panel.showInheritance, (v) => { panel.showInheritance = v; cb.markDirty(); });
    addToggle(body, "集約エッジ (has-a)", panel.showAggregation, (v) => { panel.showAggregation = v; cb.markDirty(); });
    addToggle(body, "類似エッジ (similar)", panel.showSimilar, (v) => { panel.showSimilar = v; cb.invalidateData(); });
  }, "グラフに表示するノードとエッジを制御します。\n\n検索: field:value でノードをフィルタ\n  例: tag:character, hop:名前:2\n\nタグ表示:\n  ノード = タグ自体をノードとして表示\n  囲い = タグをノード群の包絡線として表示");

  buildSection(panelEl, "グループ", (body) => {
    // --- Group color rules list ---
    const list = body.createDiv();
    renderGroupList(list, panel, cb);
    const addBtn = body.createEl("button", { cls: "ngp-add-group", text: "新規グループ" });
    addBtn.addEventListener("click", () => {
      const idx = panel.groups.length;
      panel.groups.push({ expression: null, color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length] });
      renderGroupList(list, panel, cb);
    });
  }, "ノードの色分けルール\n  クエリ記法でマッチするノードに色を割り当て\n  例: tag:character → 赤色\n\nグループ分けルール（クラスター配置）は\n「クラスター配置」セクションで設定します");

  buildSection(panelEl, "表示", (body) => {
    addToggle(body, "矢印", panel.showArrows, (v) => { panel.showArrows = v; cb.doRender(); });
    addToggle(body, "ノード色（自動）", panel.colorNodesByCategory, (v) => { panel.colorNodesByCategory = v; cb.doRender(); });
    addToggle(body, "エッジ色（属性別）", panel.colorEdgesByRelation, (v) => { panel.colorEdgesByRelation = v; cb.markDirty(); });
    addToggle(body, "結線の濃淡（被リンク数）", panel.fadeEdgesByDegree, (v) => { panel.fadeEdgesByDegree = v; cb.markDirty(); });
    addSlider(body, "テキストフェードの閾値", 0, 1, 0.05, panel.textFadeThreshold, (v) => { panel.textFadeThreshold = v; cb.applyTextFade(); });
    addSlider(body, "ノードの大きさ", 2, 20, 1, panel.nodeSize, (v) => { panel.nodeSize = v; cb.doRender(); });
    addToggle(body, "被リンク数でサイズ変更", panel.scaleByDegree, (v) => { panel.scaleByDegree = v; cb.doRender(); });
    addSlider(body, "ホバー強調ホップ数", 1, 5, 1, panel.hoverHops, (v) => { panel.hoverHops = v; });
  }, "グラフの見た目を調整します。\n\n矢印: エッジに方向を示す矢印を表示\nノード色: category フィールドで自動色分け\nエッジ色: 関係種別ごとに色分け\nテキストフェード: ズームアウト時のラベル消失閾値\nホバー強調: マウスオーバー時に何ホップ先まで強調するか");

  buildSection(panelEl, "ノードルール", (body) => {
    const ruleListEl = body.createDiv({ cls: "ngp-noderule-list" });
    renderNodeRuleList(ruleListEl, panel, cb);

    const addBtn = body.createEl("button", { cls: "ngp-add-group", text: "ルール追加" });
    addBtn.addEventListener("click", () => {
      panel.nodeRules.push({ query: "*", spacingMultiplier: 1.0, gravityAngle: -1, gravityStrength: 0.1 });
      renderNodeRuleList(ruleListEl, panel, cb);
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });
  }, "クエリにマッチするノードの間隔や重力を個別制御します。\n\nquery: 対象ノードのクエリ (*, tag:character 等)\n間隔: ノード同士の距離の倍率\n重力: 特定方向への引力 (角度と強度)");

  if (panel.colorEdgesByRelation && ctx.relationColors.size > 0) {
    buildSection(panelEl, "属性カラー", (body) => {
      const container = body.createDiv({ cls: "graph-color-groups-container" });
      for (const [rel, color] of ctx.relationColors) {
        const group = container.createDiv({ cls: "graph-color-group" });
        const label = group.createEl("span", { text: rel, cls: "graph-color-group-label" });
        label.style.cssText = "flex:1;font-size:var(--font-ui-small);";
        const picker = group.createEl("input", { type: "color" });
        picker.setAttribute("aria-label", "クリックで色を変更");
        picker.value = color;
        picker.addEventListener("input", () => {
          ctx.relationColors.set(rel, picker.value);
          cb.markDirty();
        });
      }
    });
  }

  if (ctx.currentLayout === "force") {
    buildSection(panelEl, "クラスター配置", (body) => {
      addSelect(body, "配置パターン", [
        { value: "spiral", label: "アルキメデスの螺旋" },
        { value: "concentric", label: "同心円" },
        { value: "tree", label: "Tree" },
        { value: "grid", label: "正方形" },
        { value: "triangle", label: "三角形" },
        { value: "random", label: "無秩序" },
        { value: "mountain", label: "Mountain" },
      ], panel.clusterArrangement, (v) => {
        panel.clusterArrangement = v as ClusterArrangement;
        cb.applyClusterForce();
        cb.rebuildPanel();
        cb.restartSimulation(0.5);
      });

      addSlider(body, "ノード間隔 (半径×n)", 1, 10, 0.5, panel.clusterNodeSpacing, (v) => {
        panel.clusterNodeSpacing = v;
        cb.applyClusterForce();
        cb.restartSimulation(0.5);
      });
      addSlider(body, "グループサイズ", 0.2, 5, 0.1, panel.clusterGroupScale, (v) => {
        panel.clusterGroupScale = v;
        cb.applyClusterForce();
        cb.restartSimulation(0.5);
      });
      addSlider(body, "グループ間隔", 0.5, 5, 0.1, panel.clusterGroupSpacing, (v) => {
        panel.clusterGroupSpacing = v;
        cb.applyClusterForce();
        cb.restartSimulation(0.5);
      });
      addSlider(body, "エッジ束ね強度", 0, 1, 0.05, panel.edgeBundleStrength, (v) => {
        panel.edgeBundleStrength = v;
        cb.markDirty();
      });
      // --- Cluster group rules sub-section ---
      const clusterHeader = body.createDiv({ cls: "setting-item" });
      clusterHeader.createDiv({ cls: "setting-item-name", text: "グループ分けルール" });
      const clusterListEl = body.createDiv({ cls: "ngp-cluster-rule-list" });
      renderClusterRuleList(clusterListEl, panel, cb);

      const addClusterBtn = body.createEl("button", { cls: "ngp-add-group", text: "＋ グループルール追加" });
      addClusterBtn.addEventListener("click", () => {
        panel.clusterGroupRules.push({ groupBy: "tag", recursive: false });
        renderClusterRuleList(clusterListEl, panel, cb);
        cb.applyClusterForce();
        cb.rebuildPanel();
        cb.restartSimulation(0.5);
      });

      // --- Directional gravity rules sub-section ---
      const gravHeader = body.createDiv({ cls: "setting-item" });
      gravHeader.createDiv({ cls: "setting-item-name", text: "方向重力ルール" });
      const gravListEl = body.createDiv({ cls: "ngp-gravity-rule-list" });
      renderDirectionalGravityList(gravListEl, panel, ctx, cb);

      const addGravBtn = body.createEl("button", { cls: "ngp-add-group", text: "＋ 重力ルール追加" });
      addGravBtn.addEventListener("click", () => {
        panel.directionalGravityRules.push({ filter: "*", direction: "top", strength: 0.1 });
        renderDirectionalGravityList(gravListEl, panel, ctx, cb);
        cb.applyDirectionalGravityForce();
        cb.restartSimulation(0.3);
      });

      // --- Sort rules sub-section ---
      const sortHeader = body.createDiv({ cls: "setting-item" });
      sortHeader.createDiv({ cls: "setting-item-name", text: "ソート順" });
      const sortListEl = body.createDiv({ cls: "ngp-sort-list" });
      renderSortRuleList(sortListEl, panel, cb);

      const addSortBtn = body.createEl("button", { cls: "ngp-add-group", text: "＋ ソートルール追加" });
      addSortBtn.addEventListener("click", () => {
        panel.sortRules.push({ key: "label", order: "asc" });
        renderSortRuleList(sortListEl, panel, cb);
        cb.applyClusterForce();
        cb.doRender();
      });
    }, "Force レイアウトでのクラスター配置を制御します。\n\n配置パターン: グループの並べ方\nノード間隔: グループ内のノード同士の距離\nグループサイズ/間隔: グループの大きさと距離\nエッジ束ね強度: クラスタ間エッジの曲がり具合（0=直線, 1=強い束ね）\nソート順: グループ内のノードの並び順");
  }

  // Force parameters are only relevant when NOT in force layout
  // (cluster arrangement always active in force layout, suppresses these forces)
  if (ctx.currentLayout !== "force") {
    buildSection(panelEl, "力の強さ", (body) => {
      addSlider(body, "中心力", 0, 0.2, 0.005, panel.centerForce, (v) => { panel.centerForce = v; cb.updateForces(); });
      addSlider(body, "反発力", 0, 1000, 10, panel.repelForce, (v) => { panel.repelForce = v; cb.updateForces(); });
      addSlider(body, "リンクの力", 0, 0.1, 0.002, panel.linkForce, (v) => { panel.linkForce = v; cb.updateForces(); });
      addSlider(body, "リンク距離", 20, 500, 10, panel.linkDistance, (v) => { panel.linkDistance = v; cb.updateForces(); });
      addSlider(body, "囲い間隔", 0.5, 5, 0.1, panel.enclosureSpacing, (v) => { panel.enclosureSpacing = v; cb.updateForces(); });
    }, "力学シミュレーションのパラメータを調整します。\n\n中心力: ノードを中心に引き寄せる力\n反発力: ノード同士の反発距離\nリンクの力: エッジによる引力強度\nリンク距離: エッジの目標長さ\n囲い間隔: タグ包絡線のパディング");
  }

  // --- プラグイン設定（グラフパネルから直接編集） ---
  buildSection(panelEl, "プラグイン設定", (body) => {
    const s = ctx.settings;

    addTextInput(body, "メタデータフィールド", s.metadataFields.join(", "), "tags, category, characters", (v) => {
      s.metadataFields = v.split(",").map(x => x.trim()).filter(Boolean);
      ctx.saveSettings();
      cb.invalidateData();
    });

    addTextInput(body, "色分けフィールド", s.colorField, "category", (v) => {
      s.colorField = v.trim();
      ctx.saveSettings();
      cb.doRender();
    });

    addTextInput(body, "グループフィールド", s.groupField, "category", (v) => {
      s.groupField = v.trim();
      ctx.saveSettings();
      cb.invalidateData();
    });

    addSlider(body, "囲い最小比率", 0, 0.3, 0.01, s.enclosureMinRatio, (v) => {
      s.enclosureMinRatio = v;
      ctx.saveSettings();
      cb.doRender();
    });

    // --- Ontology sub-section ---
    body.createEl("div", { cls: "setting-item-name", text: "― オントロジー ―" }).style.cssText = "margin-top:8px;opacity:0.7;font-size:0.85em;";

    addTextInput(body, "継承フィールド (is-a)", s.ontology.inheritanceFields.join(", "), "parent, extends, up", (v) => {
      s.ontology.inheritanceFields = v.split(",").map(x => x.trim()).filter(Boolean);
      ctx.saveSettings();
      cb.invalidateData();
    });

    addTextInput(body, "集約フィールド (has-a)", s.ontology.aggregationFields.join(", "), "contains, parts, has", (v) => {
      s.ontology.aggregationFields = v.split(",").map(x => x.trim()).filter(Boolean);
      ctx.saveSettings();
      cb.invalidateData();
    });

    addTextInput(body, "類似フィールド", s.ontology.similarFields.join(", "), "similar, related", (v) => {
      s.ontology.similarFields = v.split(",").map(x => x.trim()).filter(Boolean);
      ctx.saveSettings();
      cb.invalidateData();
    });

    addToggle(body, "タグ階層から継承エッジ生成", s.ontology.useTagHierarchy, (v) => {
      s.ontology.useTagHierarchy = v;
      ctx.saveSettings();
      cb.invalidateData();
    });
  }, "プラグイン全体の設定です。変更は即座に反映されます。\n\nメタデータフィールド: グラフの関係構築に使う frontmatter フィールド名（カンマ区切り）\n色分けフィールド: ノードの自動色分けに使うフィールド\nグループフィールド: 同心円/Sunburst のグループ分けフィールド\n囲い最小比率: 包絡線表示の最小グループサイズ\n\nオントロジー:\n  継承 (is-a): 親子関係のフィールド\n  集約 (has-a): 包含関係のフィールド\n  類似: 関連性のフィールド\n  タグ階層: #a/b → 自動で継承エッジ生成");

  // --- 設定保存・初期化ボタン（パネル末尾） ---
  const actionRow = panelEl.createDiv({ cls: "ngp-panel-actions" });
  actionRow.style.cssText = "display:flex;gap:6px;padding:8px 12px;";

  const saveBtn = actionRow.createEl("button", { cls: "mod-cta", text: "設定を保存" });
  saveBtn.style.flex = "1";
  saveBtn.addEventListener("click", () => cb.saveGroupPreset());

  const resetBtn = actionRow.createEl("button", { text: "初期化" });
  resetBtn.style.flex = "1";
  resetBtn.addEventListener("click", () => cb.resetPanel());
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function buildSection(container: HTMLElement, title: string, build: (body: HTMLElement) => void, helpText?: string) {
  const section = container.createDiv({ cls: "graph-control-section tree-item" });
  const header = section.createDiv({ cls: "tree-item-self graph-control-section-header is-clickable" });
  const collapseIcon = header.createDiv({ cls: "tree-item-icon collapse-icon" });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.classList.add("svg-icon", "right-triangle");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M3 8L12 17L21 8");
  svg.appendChild(path);
  collapseIcon.appendChild(svg);
  header.createEl("span", { cls: "tree-item-inner", text: title });

  if (helpText) {
    const helpBtn = header.createEl("span", { cls: "clickable-icon ngp-section-help", attr: { "aria-label": "Help" } });
    helpBtn.style.cssText = "margin-left:auto;opacity:0.5;";
    setIcon(helpBtn, "help-circle");
    helpBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const existing = section.querySelector(".ngp-help-popup");
      if (existing) { existing.remove(); return; }
      const popup = section.createDiv({ cls: "ngp-help-popup" });
      popup.style.cssText = "padding:8px 12px;font-size:0.85em;line-height:1.5;white-space:pre-wrap;background:var(--background-secondary);border-radius:4px;margin:4px 8px;";
      popup.textContent = helpText;
    });
  }

  const body = section.createDiv({ cls: "tree-item-children" });
  build(body);
  header.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".ngp-section-help")) return;
    const collapsed = section.hasClass("is-collapsed");
    section.toggleClass("is-collapsed", !collapsed);
  });
}

function addSlider(container: HTMLElement, label: string, min: number, max: number, step: number, initial: number, onChange: (v: number) => void) {
  const row = container.createDiv({ cls: "setting-item mod-slider" });
  const info = row.createDiv({ cls: "setting-item-info" });
  info.createDiv({ cls: "setting-item-name", text: label });
  const control = row.createDiv({ cls: "setting-item-control" });
  const input = control.createEl("input", { type: "range" });
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(initial);
  input.addEventListener("input", () => onChange(parseFloat(input.value)));
}

function addToggle(container: HTMLElement, label: string, initial: boolean, onChange: (v: boolean) => void) {
  const row = container.createDiv({ cls: "setting-item mod-toggle" });
  const info = row.createDiv({ cls: "setting-item-info" });
  info.createDiv({ cls: "setting-item-name", text: label });
  const control = row.createDiv({ cls: "setting-item-control" });
  const toggle = control.createDiv({ cls: "checkbox-container" + (initial ? " is-enabled" : "") });
  toggle.addEventListener("click", () => {
    const on = toggle.hasClass("is-enabled");
    toggle.toggleClass("is-enabled", !on);
    onChange(!on);
  });
}

function addTextInput(container: HTMLElement, label: string, initial: string, placeholder: string, onChange: (v: string) => void) {
  const row = container.createDiv({ cls: "setting-item" });
  row.style.cssText = "flex-direction:column;align-items:stretch;";
  const info = row.createDiv({ cls: "setting-item-info" });
  info.createDiv({ cls: "setting-item-name", text: label });
  const control = row.createDiv({ cls: "setting-item-control" });
  control.style.cssText = "justify-content:stretch;";
  const input = control.createEl("input", { type: "text", placeholder });
  input.value = initial;
  input.style.width = "100%";
  input.addEventListener("change", () => onChange(input.value));
}

// ---------------------------------------------------------------------------
// Search options hint — shown below query inputs on focus, like core graph view
// ---------------------------------------------------------------------------
const QUERY_OPTIONS: { prefix: string; desc: string }[] = [
  { prefix: "path:", desc: "ファイルへのパスに一致" },
  { prefix: "file:", desc: "ファイル名に一致" },
  { prefix: "tag:", desc: "タグを検索" },
  { prefix: "category:", desc: "カテゴリに一致" },
  { prefix: "id:", desc: "ノードIDに一致" },
  { prefix: "isTag", desc: "タグノードのみ" },
  { prefix: "hop:名前:N", desc: "ノードからNホップ以内" },
  { prefix: "[property]:", desc: "プロパティに一致" },
  { prefix: "AND / OR", desc: "ブール演算子で結合" },
  { prefix: "*", desc: "すべてのノードに一致" },
];

/** Maps a search prefix to the field name used by collectValueSuggestions */
const PREFIX_TO_FIELD: Record<string, string> = {
  "path:": "path",
  "file:": "file",
  "tag:": "tag",
  "category:": "category",
  "id:": "id",
};

/**
 * Parse the current input to detect if cursor is inside a `prefix:value` token.
 * Returns { prefix, partial } if found, null otherwise.
 */
function parseActiveToken(value: string, cursorPos: number): { prefix: string; partial: string; tokenStart: number } | null {
  // Walk backwards from cursor to find the token start
  const before = value.slice(0, cursorPos);
  // Find the last space before cursor (or start of string)
  const lastSpace = before.lastIndexOf(" ");
  const token = before.slice(lastSpace + 1);
  const colonIdx = token.indexOf(":");
  if (colonIdx < 0) return null;
  const prefix = token.slice(0, colonIdx + 1); // e.g. "path:"
  if (!(prefix in PREFIX_TO_FIELD)) return null;
  const partial = token.slice(colonIdx + 1); // e.g. "bibl"
  return { prefix, partial, tokenStart: lastSpace + 1 + colonIdx + 1 };
}

function attachQueryHint(input: HTMLInputElement, getSuggestions: (field: string) => string[]) {
  let hintEl: HTMLElement | null = null;
  let selectedIdx = -1;
  let currentItems: { text: string; onSelect: () => void }[] = [];

  // Create anchor wrapper immediately (not during focus, which would steal focus)
  const anchor = document.createElement("div");
  anchor.className = "ngp-suggest-anchor";
  input.parentNode!.insertBefore(anchor, input);
  anchor.appendChild(input);

  const insertText = (text: string) => {
    const cur = input.value;
    const pos = input.selectionStart ?? cur.length;
    const before = cur.slice(0, pos);
    const after = cur.slice(pos);
    const needSpace = before.length > 0 && !before.endsWith(" ") ? " " : "";
    input.value = before + needSpace + text + after;
    input.focus();
    const newPos = (before + needSpace + text).length;
    input.setSelectionRange(newPos, newPos);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const replaceTokenValue = (tokenStart: number, value: string) => {
    const cur = input.value;
    // Find end of current token (next space or end)
    let end = cur.indexOf(" ", tokenStart);
    if (end < 0) end = cur.length;
    input.value = cur.slice(0, tokenStart) + value + cur.slice(end);
    input.focus();
    const newPos = tokenStart + value.length;
    input.setSelectionRange(newPos, newPos);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const updateSelection = (container: HTMLElement) => {
    const rows = container.querySelectorAll(".search-suggest-item:not(.mod-group)");
    rows.forEach((r, i) => {
      r.classList.toggle("is-selected", i === selectedIdx);
    });
  };

  const buildOptionsList = () => {
    currentItems = QUERY_OPTIONS.map(opt => ({
      text: opt.prefix,
      onSelect: () => {
        insertText(opt.prefix.endsWith(":") ? opt.prefix : opt.prefix + " ");
        // After inserting prefix, rebuild to show value suggestions
        rebuildHint();
      },
    }));
  };

  const buildValueList = (prefix: string, partial: string, tokenStart: number) => {
    const field = PREFIX_TO_FIELD[prefix];
    if (!field) return false;
    const allValues = getSuggestions(field);
    const lowerPartial = partial.toLowerCase();
    const filtered = partial
      ? allValues.filter(v => v.toLowerCase().includes(lowerPartial))
      : allValues;
    if (filtered.length === 0) return false;
    currentItems = filtered.slice(0, 30).map(v => ({
      text: v,
      onSelect: () => {
        replaceTokenValue(tokenStart, v);
        dismissHint();
      },
    }));
    return true;
  };

  const renderHint = (headerText: string) => {
    if (hintEl) hintEl.remove();
    hintEl = document.createElement("div");
    hintEl.className = "suggestion-container mod-search-suggestion";

    // Header
    const headerItem = hintEl.createDiv({ cls: "suggestion-item mod-complex search-suggest-item mod-group" });
    const headerContent = headerItem.createDiv({ cls: "suggestion-content" });
    const headerTitle = headerContent.createDiv({ cls: "suggestion-title list-item-part mod-extended" });
    headerTitle.createEl("span", { text: headerText });
    const headerAux = headerItem.createDiv({ cls: "suggestion-aux" });
    const infoBtn = headerAux.createDiv({ cls: "list-item-part search-suggest-icon clickable-icon" });
    infoBtn.setAttribute("aria-label", "詳細を閲覧");
    setIcon(infoBtn, "info");

    // Items
    for (let i = 0; i < currentItems.length; i++) {
      const ci = currentItems[i];
      const item = hintEl.createDiv({ cls: "suggestion-item mod-complex search-suggest-item" });
      const content = item.createDiv({ cls: "suggestion-content" });
      const title = content.createDiv({ cls: "suggestion-title" });
      // For options list, show description; for value list, just the value
      const opt = QUERY_OPTIONS.find(o => o.prefix === ci.text);
      if (opt) {
        title.createEl("span", { text: opt.prefix });
        title.createEl("span", { cls: "search-suggest-info-text", text: opt.desc });
      } else {
        title.createEl("span", { text: ci.text });
      }
      item.addEventListener("click", () => ci.onSelect());
      item.addEventListener("mouseenter", () => {
        selectedIdx = i;
        updateSelection(hintEl!);
      });
    }

    selectedIdx = 0;
    updateSelection(hintEl);
    anchor.appendChild(hintEl);
  };

  const rebuildHint = () => {
    const pos = input.selectionStart ?? input.value.length;
    const token = parseActiveToken(input.value, pos);
    if (token && buildValueList(token.prefix, token.partial, token.tokenStart)) {
      renderHint(token.prefix.slice(0, -1) + " の候補");
    } else {
      buildOptionsList();
      renderHint("検索オプション");
    }
  };

  const dismissHint = () => {
    hintEl?.remove();
    hintEl = null;
    selectedIdx = -1;
    currentItems = [];
  };

  const show = () => rebuildHint();

  const hide = () => {
    if (!hintEl) return;
    setTimeout(() => {
      if (input === document.activeElement) return;
      dismissHint();
    }, 150);
  };

  input.addEventListener("focus", show);
  input.addEventListener("blur", hide);
  // Rebuild on input to switch between options/values as user types
  input.addEventListener("input", () => {
    if (input === document.activeElement) rebuildHint();
  });
  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (!hintEl || currentItems.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIdx = (selectedIdx + 1) % currentItems.length;
      updateSelection(hintEl);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIdx = (selectedIdx - 1 + currentItems.length) % currentItems.length;
      updateSelection(hintEl);
    } else if (e.key === "Enter" && selectedIdx >= 0 && selectedIdx < currentItems.length) {
      e.preventDefault();
      currentItems[selectedIdx].onSelect();
    } else if (e.key === "Escape") {
      dismissHint();
    }
  });
}

function addSelect(container: HTMLElement, label: string, options: { value: string; label: string }[], initial: string, onChange: (v: string) => void) {
  const row = container.createDiv({ cls: "setting-item" });
  const info = row.createDiv({ cls: "setting-item-info" });
  info.createDiv({ cls: "setting-item-name", text: label });
  const control = row.createDiv({ cls: "setting-item-control" });
  const sel = control.createEl("select", { cls: "dropdown" });
  for (const opt of options) {
    const el = sel.createEl("option", { text: opt.label, value: opt.value });
    if (opt.value === initial) el.selected = true;
  }
  sel.addEventListener("change", () => onChange(sel.value));
}

function addDirectionToggle(container: HTMLElement, label: string, initial: 1 | -1, onChange: (v: 1 | -1) => void) {
  const row = container.createDiv({ cls: "setting-item" });
  const info = row.createDiv({ cls: "setting-item-info" });
  info.createDiv({ cls: "setting-item-name", text: label });
  const control = row.createDiv({ cls: "setting-item-control" });
  const btn = control.createEl("button", { cls: "ngp-direction-btn", text: initial === 1 ? "時計回り ↻" : "反時計回り ↺" });
  btn.addEventListener("click", () => {
    const next: 1 | -1 = btn.textContent?.includes("時計回り ↻") ? -1 : 1;
    btn.textContent = next === 1 ? "時計回り ↻" : "反時計回り ↺";
    onChange(next);
  });
}

function renderGroupList(container: HTMLElement, panel: PanelState, cb: PanelCallbacks) {
  container.empty();
  panel.groups.forEach((g, i) => {
    const wrapper = container.createDiv({ cls: "ngp-group-wrapper" });
    wrapper.style.marginBottom = "4px";

    // Top row: color dot + text input + expand + remove
    const row = wrapper.createDiv({ cls: "ngp-group-item" });
    row.style.cssText = "display:flex;align-items:center;gap:4px;";

    // Color dot
    const colorDot = row.createDiv({ cls: "ngp-group-color" });
    colorDot.style.cssText = `width:14px;height:14px;border-radius:50%;background:${g.color};cursor:pointer;flex-shrink:0;`;
    colorDot.addEventListener("click", () => {
      const next = DEFAULT_COLORS[(DEFAULT_COLORS.indexOf(g.color as typeof DEFAULT_COLORS[number]) + 1) % DEFAULT_COLORS.length];
      g.color = next;
      colorDot.style.background = next;
      cb.doRender();
    });

    // Expression text input with parse-on-input
    const exprInput = row.createEl("input", { cls: "ngp-group-query", type: "text", placeholder: 'tag:"character" AND category:"person"' });
    exprInput.style.cssText = "flex:1;min-width:0;";
    exprInput.value = g.expression ? serializeExpr(g.expression) : "";
    exprInput.addEventListener("input", () => {
      g.expression = parseQueryExpr(exprInput.value);
      cb.doRender();
    });
    attachQueryHint(exprInput, (field) => cb.collectValueSuggestions(field));

    // Expand button → opens row-based editor
    const expandBtn = row.createEl("span", { cls: "ngp-group-expand", text: "▼" });
    expandBtn.style.cssText = "cursor:pointer;user-select:none;flex-shrink:0;font-size:12px;padding:2px 4px;";
    let editorEl: HTMLElement | null = null;
    expandBtn.addEventListener("click", () => {
      if (editorEl) {
        editorEl.remove();
        editorEl = null;
        expandBtn.textContent = "▼";
        exprInput.value = g.expression ? serializeExpr(g.expression) : "";
        return;
      }
      expandBtn.textContent = "▲";
      editorEl = wrapper.createDiv({ cls: "ngp-expr-editor" });
      editorEl.style.cssText = "padding:4px 0 4px 12px;border-left:2px solid var(--interactive-accent);margin:4px 0;";
      renderExprEditor(editorEl, g, exprInput, cb);
    });

    // Remove button
    const rm = row.createEl("span", { cls: "ngp-group-remove", text: "×" });
    rm.style.cssText = "cursor:pointer;flex-shrink:0;font-size:14px;padding:2px 4px;opacity:0.6;";
    rm.addEventListener("click", () => {
      panel.groups.splice(i, 1);
      renderGroupList(container, panel, cb);
      cb.doRender();
    });
  });
}

// ---------------------------------------------------------------------------
// Row-based expression editor (indent = parentheses)
// ---------------------------------------------------------------------------

interface ExprRow {
  field: string;
  value: string;
  indent: number;
  opBefore: BoolOp | null;  // null for first row
}

function exprToRows(expr: QueryExpression | null): ExprRow[] {
  if (!expr) return [{ field: "label", value: "", indent: 0, opBefore: null }];
  const rows: ExprRow[] = [];
  flattenExpr(expr, 0, null, rows);
  return rows;
}

function flattenExpr(expr: QueryExpression, indent: number, opBefore: BoolOp | null, rows: ExprRow[]): void {
  if (expr.type === "leaf") {
    rows.push({ field: expr.field, value: expr.value, indent, opBefore });
    return;
  }
  // Left subtree keeps current indent and opBefore
  flattenExpr(expr.left, indent, opBefore, rows);
  // Right subtree: increase indent if it's a nested branch with different precedence
  const rightIndent = expr.right.type === "branch" && needsGrouping(expr.op, expr.right.op) ? indent + 1 : indent;
  flattenExpr(expr.right, rightIndent, expr.op, rows);
}

const HIGH_PREC_OPS_SET = new Set<BoolOp>(["AND", "NAND"]);

function needsGrouping(parentOp: BoolOp, childOp: BoolOp): boolean {
  return HIGH_PREC_OPS_SET.has(parentOp) && !HIGH_PREC_OPS_SET.has(childOp);
}

function rowsToExpr(rows: ExprRow[]): QueryExpression | null {
  const valid = rows.filter(r => r.value.trim());
  if (valid.length === 0) return null;
  if (valid.length === 1) return { type: "leaf", field: valid[0].field, value: valid[0].value };
  return buildExprFromRows(valid, 0, valid.length - 1);
}

function buildExprFromRows(rows: ExprRow[], start: number, end: number): QueryExpression | null {
  if (start > end) return null;
  if (start === end) {
    return { type: "leaf", field: rows[start].field, value: rows[start].value };
  }

  // Find the minimum indent level in range
  let minIndent = Infinity;
  for (let i = start; i <= end; i++) {
    if (rows[i].indent < minIndent) minIndent = rows[i].indent;
  }

  // Find split point: lowest-precedence op at minIndent (scan right to left for left-associativity)
  const LOW_OPS = new Set<BoolOp>(["OR", "NOR", "XOR"]);
  let splitIdx = -1;
  let splitIsLow = false;

  for (let i = start + 1; i <= end; i++) {
    if (rows[i].indent !== minIndent || !rows[i].opBefore) continue;
    const isLow = LOW_OPS.has(rows[i].opBefore!);
    if (splitIdx === -1 || isLow || (!splitIsLow && !isLow)) {
      splitIdx = i;
      splitIsLow = isLow;
    }
  }

  if (splitIdx === -1) {
    return { type: "leaf", field: rows[start].field, value: rows[start].value };
  }

  const left = buildExprFromRows(rows, start, splitIdx - 1);
  const right = buildExprFromRows(rows, splitIdx, end);
  if (!left || !right) return left || right;

  return { type: "branch", op: rows[splitIdx].opBefore!, left, right };
}

function renderExprEditor(container: HTMLElement, group: GroupRule, textInput: HTMLInputElement, cb: PanelCallbacks) {
  const rows = exprToRows(group.expression);

  function rebuild() {
    group.expression = rowsToExpr(rows);
    textInput.value = group.expression ? serializeExpr(group.expression) : "";
    container.empty();
    renderRows();
    cb.doRender();
  }

  function renderRows() {
    rows.forEach((row, i) => {
      // Operator dropdown (between rows)
      if (i > 0) {
        const opRow = container.createDiv({ cls: "ngp-expr-op-row" });
        opRow.style.paddingLeft = `${row.indent * 20}px`;
        const opSel = opRow.createEl("select", { cls: "dropdown ngp-expr-op" });
        for (const op of ["AND", "OR", "XOR", "NOR", "NAND"] as BoolOp[]) {
          const el = opSel.createEl("option", { text: op, value: op });
          if (op === (row.opBefore ?? "AND")) el.selected = true;
        }
        opSel.addEventListener("change", () => { row.opBefore = opSel.value as BoolOp; rebuild(); });
      }

      const rowEl = container.createDiv({ cls: "ngp-expr-row" });
      rowEl.style.cssText = `display:flex;align-items:center;gap:4px;padding-left:${row.indent * 20}px;margin:2px 0;`;

      // Field input
      const fieldInput = rowEl.createEl("input", { cls: "ngp-expr-field", type: "text", placeholder: "field" });
      fieldInput.value = row.field;
      fieldInput.style.width = "70px";
      fieldInput.addEventListener("input", () => { row.field = fieldInput.value; rebuild(); });

      rowEl.createEl("span", { text: ":" });

      // Value input
      const valInput = rowEl.createEl("input", { cls: "ngp-expr-value", type: "text", placeholder: "value" });
      valInput.value = row.value;
      valInput.style.flex = "1";
      valInput.addEventListener("input", () => { row.value = valInput.value; rebuild(); });

      // Indent/dedent buttons
      const indentBtn = rowEl.createEl("span", { cls: "ngp-expr-btn", text: "→" });
      indentBtn.style.cssText = "cursor:pointer;user-select:none;";
      indentBtn.addEventListener("click", () => { row.indent++; rebuild(); });
      const dedentBtn = rowEl.createEl("span", { cls: "ngp-expr-btn", text: "←" });
      dedentBtn.style.cssText = "cursor:pointer;user-select:none;";
      dedentBtn.addEventListener("click", () => { row.indent = Math.max(0, row.indent - 1); rebuild(); });

      // Delete button
      const rmBtn = rowEl.createEl("span", { cls: "ngp-group-remove", text: "×" });
      rmBtn.addEventListener("click", () => {
        rows.splice(i, 1);
        if (rows.length > 0 && rows[0].opBefore) rows[0].opBefore = null;
        rebuild();
      });
    });

    // Add row button
    const addBtn = container.createEl("button", { cls: "ngp-add-group", text: "＋ 条件追加" });
    addBtn.addEventListener("click", () => {
      rows.push({ field: "label", value: "", indent: 0, opBefore: "AND" });
      rebuild();
    });
  }

  renderRows();
}

const SORT_KEY_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "degree", label: "リンク数" },
  { value: "in-degree", label: "被リンク数" },
  { value: "tag", label: "タグ" },
  { value: "category", label: "カテゴリ" },
  { value: "label", label: "ラベル" },
  { value: "importance", label: "伝播重要度" },
];

function renderSortRuleList(
  container: HTMLElement,
  panel: PanelState,
  cb: PanelCallbacks,
) {
  container.empty();
  const rules = panel.sortRules;
  rules.forEach((rule, i) => {
    const row = container.createDiv({ cls: "ngp-group-item" });

    // Sort key dropdown
    const keySel = row.createEl("select", { cls: "dropdown" });
    keySel.style.flex = "1";
    for (const opt of SORT_KEY_OPTIONS) {
      const el = keySel.createEl("option", { text: opt.label, value: opt.value });
      if (opt.value === rule.key) el.selected = true;
    }
    keySel.addEventListener("change", () => {
      rule.key = keySel.value as SortKey;
      cb.applyClusterForce();
      cb.doRender();
    });

    // Order toggle button
    const orderBtn = row.createEl("button", {
      cls: "ngp-direction-btn",
      text: rule.order === "asc" ? "↑昇順" : "↓降順",
    });
    orderBtn.style.marginLeft = "4px";
    orderBtn.style.minWidth = "60px";
    orderBtn.addEventListener("click", () => {
      rule.order = rule.order === "asc" ? "desc" : "asc";
      orderBtn.textContent = rule.order === "asc" ? "↑昇順" : "↓降順";
      cb.applyClusterForce();
      cb.doRender();
    });

    // Remove button
    const rm = row.createEl("span", { cls: "ngp-group-remove", text: "\u00D7" });
    rm.style.marginLeft = "4px";
    rm.addEventListener("click", () => {
      rules.splice(i, 1);
      renderSortRuleList(container, panel, cb);
      cb.applyClusterForce();
      cb.doRender();
    });
  });
}

// ---------------------------------------------------------------------------
// Cluster group rule list
// ---------------------------------------------------------------------------

const CLUSTER_GROUP_OPTIONS: { value: ClusterGroupBy; label: string }[] = [
  { value: "tag", label: "タグ" },
  { value: "backlinks", label: "被リンク数" },
  { value: "node_type", label: "ノードタイプ" },
];

function renderClusterRuleList(
  container: HTMLElement,
  panel: PanelState,
  cb: PanelCallbacks,
) {
  container.empty();
  const rules = panel.clusterGroupRules;
  rules.forEach((rule, i) => {
    const row = container.createDiv({ cls: "ngp-group-item" });

    // GroupBy dropdown
    const groupSel = row.createEl("select", { cls: "dropdown" });
    groupSel.style.flex = "1";
    for (const opt of CLUSTER_GROUP_OPTIONS) {
      const el = groupSel.createEl("option", { text: opt.label, value: opt.value });
      if (opt.value === rule.groupBy) el.selected = true;
    }
    groupSel.addEventListener("change", () => {
      rule.groupBy = groupSel.value as ClusterGroupBy;
      cb.applyClusterForce();
      cb.rebuildPanel();
      cb.restartSimulation(0.5);
    });

    // Recursive toggle (compact checkbox + label)
    const recWrap = row.createEl("label");
    recWrap.style.cssText = "margin-left:4px;display:flex;align-items:center;gap:2px;";
    const recToggle = recWrap.createDiv({
      cls: "checkbox-container" + (rule.recursive ? " is-enabled" : ""),
    });
    recWrap.createEl("span", { text: "再帰", cls: "ngp-hint" });
    recToggle.addEventListener("click", () => {
      rule.recursive = !rule.recursive;
      recToggle.toggleClass("is-enabled", rule.recursive);
      cb.applyClusterForce();
      cb.restartSimulation(0.5);
    });

    // Remove button
    const rm = row.createEl("span", { cls: "ngp-group-remove", text: "\u00D7" });
    rm.style.marginLeft = "4px";
    rm.addEventListener("click", () => {
      rules.splice(i, 1);
      renderClusterRuleList(container, panel, cb);
      cb.applyClusterForce();
      cb.rebuildPanel();
      cb.restartSimulation(0.5);
    });
  });
}

// ---------------------------------------------------------------------------
// Directional gravity rule list
// ---------------------------------------------------------------------------

function renderDirectionalGravityList(
  container: HTMLElement,
  panel: PanelState,
  ctx: PanelContext,
  cb: PanelCallbacks,
) {
  container.empty();
  const rules = panel.directionalGravityRules;
  rules.forEach((rule, i) => {
    const row = container.createDiv({ cls: "ngp-group-item" });

    const filterInput = row.createEl("input", { cls: "ngp-group-query", type: "text", placeholder: "tag:character, category:protagonist, *" });
    filterInput.value = rule.filter;
    filterInput.style.flex = "1";
    filterInput.addEventListener("input", () => {
      rule.filter = filterInput.value;
      cb.applyDirectionalGravityForce();
      cb.restartSimulation(0.3);
    });
    attachQueryHint(filterInput, (field) => cb.collectValueSuggestions(field));

    const dirSelect = row.createEl("select", { cls: "dropdown" });
    dirSelect.style.width = "80px";
    dirSelect.style.marginLeft = "4px";
    const dirOptions: { value: string; label: string }[] = [
      { value: "top", label: "上" },
      { value: "bottom", label: "下" },
      { value: "left", label: "左" },
      { value: "right", label: "右" },
      { value: "custom", label: "カスタム" },
    ];
    const isCustom = typeof rule.direction === "number";
    for (const opt of dirOptions) {
      const el = dirSelect.createEl("option", { text: opt.label, value: opt.value });
      if (isCustom && opt.value === "custom") el.selected = true;
      else if (!isCustom && opt.value === rule.direction) el.selected = true;
    }

    const radInput = row.createEl("input", { cls: "ngp-group-query", type: "number" });
    radInput.style.width = "60px";
    radInput.style.marginLeft = "4px";
    radInput.step = "0.1";
    radInput.placeholder = "rad";
    radInput.value = isCustom ? String(rule.direction) : "0";
    radInput.style.display = isCustom ? "" : "none";

    dirSelect.addEventListener("change", () => {
      const val = dirSelect.value;
      if (val === "custom") {
        rule.direction = parseFloat(radInput.value) || 0;
        radInput.style.display = "";
      } else {
        rule.direction = val as "top" | "bottom" | "left" | "right";
        radInput.style.display = "none";
      }
      cb.applyDirectionalGravityForce();
      cb.restartSimulation(0.3);
    });

    radInput.addEventListener("input", () => {
      rule.direction = parseFloat(radInput.value) || 0;
      cb.applyDirectionalGravityForce();
      cb.restartSimulation(0.3);
    });

    const strSlider = row.createEl("input", { type: "range" });
    strSlider.min = "0.01";
    strSlider.max = "1";
    strSlider.step = "0.01";
    strSlider.value = String(rule.strength);
    strSlider.style.width = "60px";
    strSlider.style.marginLeft = "4px";
    strSlider.addEventListener("input", () => {
      rule.strength = parseFloat(strSlider.value);
      cb.applyDirectionalGravityForce();
      cb.restartSimulation(0.3);
    });

    const rm = row.createEl("span", { cls: "ngp-group-remove", text: "\u00D7" });
    rm.addEventListener("click", () => {
      rules.splice(i, 1);
      renderDirectionalGravityList(container, panel, ctx, cb);
      cb.applyDirectionalGravityForce();
      cb.restartSimulation(0.3);
    });
  });
}

// ---------------------------------------------------------------------------
// Node Rule list (unified spacing + gravity per query)
// ---------------------------------------------------------------------------

/** Direction presets for gravity dropdown. Angle in degrees. */
const GRAVITY_DIR_OPTIONS: { value: string; label: string; angle: number }[] = [
  { value: "none", label: "なし", angle: -1 },
  { value: "up", label: "↑上", angle: 270 },
  { value: "down", label: "↓下", angle: 90 },
  { value: "left", label: "←左", angle: 180 },
  { value: "right", label: "→右", angle: 0 },
  { value: "custom", label: "角度指定", angle: -1 },
];

function angleToPreset(angle: number): string {
  if (angle < 0) return "none";
  if (angle === 270) return "up";
  if (angle === 90) return "down";
  if (angle === 180) return "left";
  if (angle === 0) return "right";
  return "custom";
}

function renderNodeRuleList(
  container: HTMLElement,
  panel: PanelState,
  cb: PanelCallbacks,
) {
  container.empty();
  const rules = panel.nodeRules;
  rules.forEach((rule, i) => {
    const wrapper = container.createDiv({ cls: "ngp-noderule-item" });
    wrapper.style.cssText = "margin-bottom:6px;border-left:2px solid var(--interactive-accent);padding-left:8px;";

    // Row 1: Query input + delete button
    const row1 = wrapper.createDiv({ cls: "ngp-group-item" });
    row1.style.cssText = "display:flex;align-items:center;gap:4px;margin-bottom:2px;";

    const queryInput = row1.createEl("input", { cls: "ngp-search", type: "text", placeholder: "tag:character, *, degree>5" });
    queryInput.style.cssText = "flex:1;min-width:0;";
    queryInput.value = rule.query;
    queryInput.addEventListener("input", () => {
      rule.query = queryInput.value;
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });
    attachQueryHint(queryInput, (field) => cb.collectValueSuggestions(field));

    const rm = row1.createEl("span", { cls: "ngp-group-remove", text: "\u00D7" });
    rm.style.cssText = "cursor:pointer;flex-shrink:0;font-size:14px;padding:2px 4px;opacity:0.6;";
    rm.addEventListener("click", () => {
      rules.splice(i, 1);
      renderNodeRuleList(container, panel, cb);
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });

    // Row 2: spacing slider + gravity controls (indented)
    const row2 = wrapper.createDiv();
    row2.style.cssText = "padding-left:12px;";

    // Spacing slider
    const spacingRow = row2.createDiv({ cls: "setting-item mod-slider" });
    spacingRow.style.cssText = "padding:2px 0;";
    const spacingInfo = spacingRow.createDiv({ cls: "setting-item-info" });
    spacingInfo.createDiv({ cls: "setting-item-name", text: "間隔" });
    const spacingControl = spacingRow.createDiv({ cls: "setting-item-control" });
    const spacingSlider = spacingControl.createEl("input", { type: "range" });
    spacingSlider.min = "0.1";
    spacingSlider.max = "5.0";
    spacingSlider.step = "0.1";
    spacingSlider.value = String(rule.spacingMultiplier);
    const spacingLabel = spacingControl.createEl("span", { text: String(rule.spacingMultiplier) });
    spacingLabel.style.cssText = "min-width:30px;text-align:right;font-size:0.85em;";
    spacingSlider.addEventListener("input", () => {
      rule.spacingMultiplier = parseFloat(spacingSlider.value);
      spacingLabel.textContent = spacingSlider.value;
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });

    // Gravity direction dropdown
    const gravRow = row2.createDiv({ cls: "ngp-group-item" });
    gravRow.style.cssText = "display:flex;align-items:center;gap:4px;padding:2px 0;";

    const gravLabel = gravRow.createEl("span", { cls: "setting-item-name", text: "重力" });
    gravLabel.style.cssText = "flex-shrink:0;";

    const dirSelect = gravRow.createEl("select", { cls: "dropdown" });
    dirSelect.style.cssText = "width:90px;";
    const currentPreset = angleToPreset(rule.gravityAngle);
    for (const opt of GRAVITY_DIR_OPTIONS) {
      const el = dirSelect.createEl("option", { text: opt.label, value: opt.value });
      if (opt.value === currentPreset) el.selected = true;
    }

    // Custom angle input (hidden unless custom)
    const angleInput = gravRow.createEl("input", { cls: "ngp-search", type: "number" });
    angleInput.style.cssText = "width:60px;";
    angleInput.step = "1";
    angleInput.min = "0";
    angleInput.max = "360";
    angleInput.placeholder = "°";
    angleInput.value = currentPreset === "custom" ? String(rule.gravityAngle) : "0";
    angleInput.style.display = currentPreset === "custom" ? "" : "none";

    // Strength slider (hidden if direction=none)
    const strSlider = gravRow.createEl("input", { type: "range" });
    strSlider.min = "0.01";
    strSlider.max = "1";
    strSlider.step = "0.01";
    strSlider.value = String(rule.gravityStrength);
    strSlider.style.cssText = "width:60px;";
    strSlider.style.display = currentPreset === "none" ? "none" : "";

    dirSelect.addEventListener("change", () => {
      const val = dirSelect.value;
      if (val === "none") {
        rule.gravityAngle = -1;
        angleInput.style.display = "none";
        strSlider.style.display = "none";
      } else if (val === "custom") {
        rule.gravityAngle = parseFloat(angleInput.value) || 0;
        angleInput.style.display = "";
        strSlider.style.display = "";
      } else {
        const preset = GRAVITY_DIR_OPTIONS.find(o => o.value === val);
        rule.gravityAngle = preset?.angle ?? -1;
        angleInput.style.display = "none";
        strSlider.style.display = "";
      }
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });

    angleInput.addEventListener("input", () => {
      rule.gravityAngle = parseFloat(angleInput.value) || 0;
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });

    strSlider.addEventListener("input", () => {
      rule.gravityStrength = parseFloat(strSlider.value);
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });
  });
}
