import type { LayoutType, GraphNode, ShellInfo, DirectionalGravityRule, ClusterGroupBy, ClusterArrangement } from "../types";
import { DEFAULT_COLORS } from "../types";
import { repositionShell } from "../layouts/concentric";

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
  linkThickness: number;
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
  concentricMinRadius: number;
  concentricRadiusStep: number;
  showOrbitRings: boolean;
  orbitAutoRotate: boolean;
  groups: { query: string; color: string }[];
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
  clusterGroupBy: ClusterGroupBy;
  clusterArrangement: ClusterArrangement;
  clusterGridCols: number;
  clusterNodeSpacing: number;
  clusterGroupScale: number;
  clusterGroupSpacing: number;
}

export const DEFAULT_PANEL: PanelState = {
  showTags: true,
  showAttachments: false,
  existingOnly: false,
  showOrphans: true,
  showArrows: false,
  textFadeThreshold: 0.5,
  nodeSize: 8,
  linkThickness: 1.5,
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
  clusterGroupBy: "none" as ClusterGroupBy,
  clusterArrangement: "free" as ClusterArrangement,
  clusterGridCols: 5,
  clusterNodeSpacing: 3.0,
  clusterGroupScale: 3.0,
  clusterGroupSpacing: 2.0,
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
    const search = body.createEl("input", { cls: "ngp-search", type: "text", placeholder: "ファイルを検索..." });
    search.value = panel.searchQuery;
    search.addEventListener("input", () => { panel.searchQuery = search.value.toLowerCase(); cb.applySearch(); });
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
    const list = body.createDiv();
    renderGroupList(list, panel, cb);
    const addBtn = body.createEl("button", { cls: "ngp-add-group", text: "新規グループ" });
    addBtn.addEventListener("click", () => {
      const idx = panel.groups.length;
      panel.groups.push({ query: "", color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length] });
      renderGroupList(list, panel, cb);
    });
  });

  buildSection(panelEl, "表示", (body) => {
    addToggle(body, "矢印", panel.showArrows, (v) => { panel.showArrows = v; cb.doRender(); });
    addToggle(body, "ノード色（自動）", panel.colorNodesByCategory, (v) => { panel.colorNodesByCategory = v; cb.doRender(); });
    addToggle(body, "エッジ色（属性別）", panel.colorEdgesByRelation, (v) => { panel.colorEdgesByRelation = v; cb.markDirty(); });
    addSlider(body, "テキストフェードの閾値", 0, 1, 0.05, panel.textFadeThreshold, (v) => { panel.textFadeThreshold = v; cb.applyTextFade(); });
    addSlider(body, "ノードの大きさ", 2, 20, 1, panel.nodeSize, (v) => { panel.nodeSize = v; cb.doRender(); });
    addSlider(body, "リンクの太さ", 1, 5, 0.5, panel.linkThickness, (v) => { panel.linkThickness = v; cb.markDirty(); });
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

  buildSection(panelEl, "エッジ凡例", (body) => {
    const items: { label: string; color: string; shape: string }[] = [
      { label: "継承 (is-a)", color: "#9ca3af", shape: "▷" },
      { label: "集約 (has-a)", color: "#60a5fa", shape: "◇" },
      { label: "has-tag", color: "#a78bfa", shape: "─" },
      { label: "通常リンク", color: "#555555", shape: "─" },
    ];
    for (const item of items) {
      const row = body.createDiv({ cls: "setting-item" });
      const marker = row.createEl("span");
      marker.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:20px;height:14px;color:${item.color};font-size:14px;margin-right:6px;`;
      marker.textContent = item.shape;
      row.createEl("span", { text: item.label, cls: "setting-item-name" });
    }
  });

  if (ctx.currentLayout === "force") {
    buildSection(panelEl, "クラスター配置", (body) => {
      addSelect(body, "グループ分け", [
        { value: "none", label: "なし" },
        { value: "tag", label: "タグ" },
        { value: "backlinks", label: "被リンク数" },
        { value: "node_type", label: "ノードタイプ" },
      ], panel.clusterGroupBy, (v) => {
        panel.clusterGroupBy = v as ClusterGroupBy;
        cb.applyClusterForce();
        cb.rebuildPanel();
        cb.restartSimulation(0.5);
      });
      addSelect(body, "配置パターン", [
        { value: "free", label: "無秩序" },
        { value: "spiral", label: "アルキメデスの螺旋" },
        { value: "concentric", label: "同心円" },
        { value: "tree", label: "Tree" },
        { value: "grid", label: "m,n配置" },
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
      if (panel.clusterArrangement === "grid") {
        addSlider(body, "グリッド列数", 2, 20, 1, panel.clusterGridCols, (v) => {
          panel.clusterGridCols = v;
          cb.applyClusterForce();
          cb.restartSimulation(0.3);
        });
      }
    });
  }

  const clusterActive = panel.clusterArrangement !== "free";
  if (!clusterActive) {
    buildSection(panelEl, "力の強さ", (body) => {
      addSlider(body, "中心力", 0, 0.2, 0.005, panel.centerForce, (v) => { panel.centerForce = v; cb.updateForces(); });
      addSlider(body, "反発力", 0, 1000, 10, panel.repelForce, (v) => { panel.repelForce = v; cb.updateForces(); });
      addSlider(body, "リンクの力", 0, 0.1, 0.002, panel.linkForce, (v) => { panel.linkForce = v; cb.updateForces(); });
      addSlider(body, "リンク距離", 20, 500, 10, panel.linkDistance, (v) => { panel.linkDistance = v; cb.updateForces(); });
      addSlider(body, "囲い間隔", 0.5, 5, 0.1, panel.enclosureSpacing, (v) => { panel.enclosureSpacing = v; cb.updateForces(); });
    });
  }
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

function renderGroupList(container: HTMLElement, panel: PanelState, cb: PanelCallbacks) {
  container.empty();
  panel.groups.forEach((g, i) => {
    const row = container.createDiv({ cls: "ngp-group-item" });
    const colorDot = row.createDiv({ cls: "ngp-group-color" });
    colorDot.style.background = g.color;
    colorDot.addEventListener("click", () => {
      const next = DEFAULT_COLORS[(DEFAULT_COLORS.indexOf(g.color as typeof DEFAULT_COLORS[number]) + 1) % DEFAULT_COLORS.length];
      g.color = next;
      colorDot.style.background = next;
      cb.doRender();
    });
    const input = row.createEl("input", { cls: "ngp-group-query", type: "text", placeholder: "検索クエリ..." });
    input.value = g.query;
    input.addEventListener("input", () => { g.query = input.value.toLowerCase(); cb.doRender(); });
    const rm = row.createEl("span", { cls: "ngp-group-remove", text: "\u00D7" });
    rm.addEventListener("click", () => { panel.groups.splice(i, 1); renderGroupList(container, panel, cb); cb.doRender(); });
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
