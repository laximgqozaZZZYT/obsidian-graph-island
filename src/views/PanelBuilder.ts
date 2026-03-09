import type { LayoutType, GraphNode, ShellInfo, DirectionalGravityRule, ClusterArrangement, ClusterGroupRule, GroupRule, SortRule, SortKey, SortOrder } from "../types";
import { DEFAULT_COLORS } from "../types";
import { repositionShell } from "../layouts/concentric";
import type { QueryExpression, BoolOp } from "../utils/query-expr";
import { parseQueryExpr, serializeExpr } from "../utils/query-expr";

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
  sortRules: SortRule[];
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
  sortRules: [{ key: "degree" as SortKey, order: "desc" as SortOrder }],
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
  startOrbitAnimation(): void;
  stopOrbitAnimation(): void;
  wakeRenderLoop(): void;
  rebuildPanel(): void;
  invalidateData(): void;       // sets rawData = null then doRender
  restartSimulation(alpha: number): void;
  applyClusterForce(): void;
  deriveAndApplyClusterRules(): void;
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
  });

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
  });

  buildSection(panelEl, "グループ", (body) => {
    // --- Common queries (multi-level cluster grouping) ---
    const cqHeader = body.createDiv({ cls: "setting-item" });
    cqHeader.createDiv({ cls: "setting-item-name", text: "共通クエリ" });
    const cqListEl = body.createDiv({ cls: "ngp-cq-list" });
    renderCommonQueryList(cqListEl, panel, cb);

    const addCqBtn = body.createEl("button", { cls: "ngp-add-group", text: "＋ クエリ追加" });
    addCqBtn.addEventListener("click", () => {
      panel.commonQueries.push({ query: "tag:*", recursive: false });
      renderCommonQueryList(cqListEl, panel, cb);
      cb.deriveAndApplyClusterRules();
    });

    // --- Group rules list ---
    const list = body.createDiv();
    renderGroupList(list, panel, cb);
    const addBtn = body.createEl("button", { cls: "ngp-add-group", text: "新規グループ" });
    addBtn.addEventListener("click", () => {
      const idx = panel.groups.length;
      panel.groups.push({ expression: null, color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length] });
      renderGroupList(list, panel, cb);
    });
  });

  buildSection(panelEl, "表示", (body) => {
    addToggle(body, "矢印", panel.showArrows, (v) => { panel.showArrows = v; cb.doRender(); });
    addToggle(body, "ノード色（自動）", panel.colorNodesByCategory, (v) => { panel.colorNodesByCategory = v; cb.doRender(); });
    addToggle(body, "エッジ色（属性別）", panel.colorEdgesByRelation, (v) => { panel.colorEdgesByRelation = v; cb.markDirty(); });
    addToggle(body, "結線の濃淡（被リンク数）", panel.fadeEdgesByDegree, (v) => { panel.fadeEdgesByDegree = v; cb.markDirty(); });
    addSlider(body, "テキストフェードの閾値", 0, 1, 0.05, panel.textFadeThreshold, (v) => { panel.textFadeThreshold = v; cb.applyTextFade(); });
    addSlider(body, "ノードの大きさ", 2, 20, 1, panel.nodeSize, (v) => { panel.nodeSize = v; cb.doRender(); });
    addToggle(body, "被リンク数でサイズ変更", panel.scaleByDegree, (v) => { panel.scaleByDegree = v; cb.doRender(); });
    addSlider(body, "ホバー強調ホップ数", 1, 5, 1, panel.hoverHops, (v) => { panel.hoverHops = v; });
  });

  buildSection(panelEl, "方向性重力", (body) => {
    const ruleListEl = body.createDiv({ cls: "ngp-dgravity-list" });
    renderDirectionalGravityList(ruleListEl, panel, ctx, cb);

    const addBtn = body.createEl("button", { cls: "ngp-add-group", text: "ルール追加" });
    addBtn.addEventListener("click", () => {
      panel.directionalGravityRules.push({ filter: "*", direction: "top", strength: 0.1 });
      renderDirectionalGravityList(ruleListEl, panel, ctx, cb);
      cb.applyDirectionalGravityForce();
      cb.restartSimulation(0.3);
    });
  });

  if (panel.colorEdgesByRelation && ctx.relationColors.size > 0) {
    buildSection(panelEl, "属性カラー", (body) => {
      for (const [rel, color] of ctx.relationColors) {
        const row = body.createDiv({ cls: "setting-item" });
        const dot = row.createEl("span");
        dot.style.cssText = `display:inline-block;width:12px;height:12px;border-radius:50%;background:${color};margin-right:8px;vertical-align:middle;`;
        row.createEl("span", { text: rel, cls: "setting-item-name" });
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
      // --- Sort rules sub-section ---
      const sortHeader = body.createDiv({ cls: "setting-item" });
      sortHeader.createDiv({ cls: "setting-item-name", text: "ソート順" });
      const sortListEl = body.createDiv({ cls: "ngp-sort-list" });
      renderSortRuleList(sortListEl, panel, cb);

      const addSortBtn = body.createEl("button", { cls: "ngp-add-group", text: "＋ ルール追加" });
      addSortBtn.addEventListener("click", () => {
        panel.sortRules.push({ key: "label", order: "asc" });
        renderSortRuleList(sortListEl, panel, cb);
        cb.applyClusterForce();
        cb.doRender();
      });
    });
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
    });
  }

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

function buildSection(container: HTMLElement, title: string, build: (body: HTMLElement) => void) {
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
  const body = section.createDiv({ cls: "tree-item-children" });
  build(body);
  header.addEventListener("click", () => {
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

function renderCommonQueryList(container: HTMLElement, panel: PanelState, cb: PanelCallbacks) {
  container.empty();
  panel.commonQueries.forEach((cq, i) => {
    const row = container.createDiv({ cls: "ngp-group-item" });
    row.style.cssText = "display:flex;align-items:center;gap:4px;margin-bottom:2px;";

    // Query input
    const input = row.createEl("input", { cls: "ngp-search", type: "text", placeholder: "tag:* / category:*" });
    input.style.cssText = "flex:1;min-width:0;";
    input.value = cq.query;
    input.addEventListener("input", () => {
      cq.query = input.value;
      cb.deriveAndApplyClusterRules();
    });

    // Recursive toggle (compact)
    const recWrap = row.createEl("label");
    recWrap.style.cssText = "display:flex;align-items:center;gap:2px;flex-shrink:0;";
    const recToggle = recWrap.createDiv({
      cls: "checkbox-container" + (cq.recursive ? " is-enabled" : ""),
    });
    recWrap.createEl("span", { text: "再帰", cls: "ngp-hint" });
    recToggle.addEventListener("click", () => {
      cq.recursive = !cq.recursive;
      recToggle.toggleClass("is-enabled", cq.recursive);
      cb.deriveAndApplyClusterRules();
    });

    // Remove button
    const rm = row.createEl("span", { cls: "ngp-group-remove", text: "×" });
    rm.style.cssText = "cursor:pointer;flex-shrink:0;font-size:14px;padding:2px 4px;opacity:0.6;";
    rm.addEventListener("click", () => {
      panel.commonQueries.splice(i, 1);
      renderCommonQueryList(container, panel, cb);
      cb.deriveAndApplyClusterRules();
    });
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
