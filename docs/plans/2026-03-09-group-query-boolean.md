# Group Query Boolean Expression + Preset Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** グループの検索クエリを複数条件＋ブール演算（AND/OR/XOR/NOR/NAND）＋括弧優先順位で指定可能にし、表示状態別プリセット＋永続保存を実現する。

**Architecture:** 新モジュール `src/utils/query-expr.ts` に AST 型・パーサー・評価関数を集約。PanelBuilder の `renderGroupList` をインデントベースの行UI に置換。GVC の `nodeColor` でAST評価を使用。プリセットは Settings に保存し、ビュー初期化時に条件マッチで自動適用。

**Tech Stack:** TypeScript, vitest

---

## Context

現在のグループシステム:
- `panel.groups: { query: string; color: string }[]`
- マッチ: `n.label.toLowerCase().includes(grp.query)` （単純部分一致）
- GVC L1412-1413 で使用

## 対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/utils/query-expr.ts` | 新規: AST型、パーサー、評価関数 |
| `tests/query-expr.test.ts` | 新規: パーサー＋評価のユニットテスト |
| `src/types.ts` | `GroupRule`, `GroupPreset`, `CommonGroupQuery` 型追加、Settings 更新 |
| `src/views/PanelBuilder.ts` | `PanelState.groups` → `GroupRule[]`、行ベースUI |
| `src/views/GraphViewContainer.ts` | `nodeColor` でAST評価、プリセット適用 |
| `src/settings.ts` | プリセット永続設定UI |
| `src/layouts/force.ts` | `matchesFilter` を QueryExpression 対応に更新 |

---

## Task 1: `src/utils/query-expr.ts` — AST 型定義 + 評価関数

**Files:**
- Create: `src/utils/query-expr.ts`
- Create: `tests/query-expr.test.ts`

**Step 1: テストファイルとモジュールの骨組みを作成**

`tests/query-expr.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { evaluateExpr, type QueryExpression, type QueryLeaf } from "../src/utils/query-expr";
import type { GraphNode } from "../src/types";

function makeNode(overrides?: Partial<GraphNode>): GraphNode {
  return { id: "n1", label: "Alice", x: 0, y: 0, vx: 0, vy: 0, tags: ["character", "protagonist"], category: "person", filePath: "characters/alice.md", ...overrides };
}

describe("evaluateExpr", () => {
  it("leaf: label substring match", () => {
    const expr: QueryLeaf = { type: "leaf", field: "label", value: "ali" };
    expect(evaluateExpr(expr, makeNode())).toBe(true);
    expect(evaluateExpr(expr, makeNode({ label: "Bob" }))).toBe(false);
  });

  it("leaf: label exact match", () => {
    const expr: QueryLeaf = { type: "leaf", field: "label", value: "Alice", exact: true };
    expect(evaluateExpr(expr, makeNode())).toBe(true);
    expect(evaluateExpr(expr, makeNode({ label: "Alice2" }))).toBe(false);
  });

  it("leaf: tag match (checks array membership)", () => {
    const expr: QueryLeaf = { type: "leaf", field: "tag", value: "character" };
    expect(evaluateExpr(expr, makeNode())).toBe(true);
    expect(evaluateExpr(expr, makeNode({ tags: ["location"] }))).toBe(false);
  });

  it("leaf: category match", () => {
    const expr: QueryLeaf = { type: "leaf", field: "category", value: "person" };
    expect(evaluateExpr(expr, makeNode())).toBe(true);
  });

  it("leaf: path match", () => {
    const expr: QueryLeaf = { type: "leaf", field: "path", value: "characters/" };
    expect(evaluateExpr(expr, makeNode())).toBe(true);
    expect(evaluateExpr(expr, makeNode({ filePath: "locations/town.md" }))).toBe(false);
  });

  it("leaf: id match", () => {
    const expr: QueryLeaf = { type: "leaf", field: "id", value: "n1" };
    expect(evaluateExpr(expr, makeNode())).toBe(true);
  });

  it("branch: AND", () => {
    const expr: QueryExpression = {
      type: "branch", op: "AND",
      left: { type: "leaf", field: "tag", value: "character" },
      right: { type: "leaf", field: "tag", value: "protagonist" },
    };
    expect(evaluateExpr(expr, makeNode())).toBe(true);
    expect(evaluateExpr(expr, makeNode({ tags: ["character"] }))).toBe(false);
  });

  it("branch: OR", () => {
    const expr: QueryExpression = {
      type: "branch", op: "OR",
      left: { type: "leaf", field: "tag", value: "character" },
      right: { type: "leaf", field: "tag", value: "location" },
    };
    expect(evaluateExpr(expr, makeNode())).toBe(true);
    expect(evaluateExpr(expr, makeNode({ tags: ["location"] }))).toBe(true);
    expect(evaluateExpr(expr, makeNode({ tags: ["item"] }))).toBe(false);
  });

  it("branch: XOR", () => {
    const expr: QueryExpression = {
      type: "branch", op: "XOR",
      left: { type: "leaf", field: "tag", value: "character" },
      right: { type: "leaf", field: "tag", value: "protagonist" },
    };
    // Both true → XOR = false
    expect(evaluateExpr(expr, makeNode())).toBe(false);
    // Only left true → XOR = true
    expect(evaluateExpr(expr, makeNode({ tags: ["character"] }))).toBe(true);
  });

  it("branch: NOR", () => {
    const expr: QueryExpression = {
      type: "branch", op: "NOR",
      left: { type: "leaf", field: "tag", value: "x" },
      right: { type: "leaf", field: "tag", value: "y" },
    };
    expect(evaluateExpr(expr, makeNode())).toBe(true); // neither matches
  });

  it("branch: NAND", () => {
    const expr: QueryExpression = {
      type: "branch", op: "NAND",
      left: { type: "leaf", field: "tag", value: "character" },
      right: { type: "leaf", field: "tag", value: "protagonist" },
    };
    expect(evaluateExpr(expr, makeNode())).toBe(false); // both true → NAND = false
    expect(evaluateExpr(expr, makeNode({ tags: ["character"] }))).toBe(true);
  });

  it("nested: (A OR B) AND C", () => {
    const expr: QueryExpression = {
      type: "branch", op: "AND",
      left: {
        type: "branch", op: "OR",
        left: { type: "leaf", field: "tag", value: "character" },
        right: { type: "leaf", field: "tag", value: "location" },
      },
      right: { type: "leaf", field: "category", value: "person" },
    };
    expect(evaluateExpr(expr, makeNode())).toBe(true);
    expect(evaluateExpr(expr, makeNode({ tags: ["location"], category: "place" }))).toBe(false);
  });
});
```

**Step 2: テスト実行 → FAIL 確認**

Run: `npx vitest run tests/query-expr.test.ts`
Expected: FAIL (module not found)

**Step 3: 実装**

`src/utils/query-expr.ts`:
```typescript
export type BoolOp = "AND" | "OR" | "XOR" | "NOR" | "NAND";

export interface QueryLeaf {
  type: "leaf";
  field: string;
  value: string;
  exact?: boolean;
}

export interface QueryBranch {
  type: "branch";
  op: BoolOp;
  left: QueryExpression;
  right: QueryExpression;
}

export type QueryExpression = QueryLeaf | QueryBranch;

/**
 * Evaluate a query expression against a graph node.
 * Field resolution:
 *  - "label": node.label
 *  - "tag": node.tags array (any element matches)
 *  - "category": node.category
 *  - "path": node.filePath
 *  - "id": node.id
 *  - "isTag": node.isTag (value = "true"/"false")
 *  - other: treated as label fallback
 */
export function evaluateExpr(
  expr: QueryExpression,
  node: { id: string; label: string; tags?: string[]; category?: string; filePath?: string; isTag?: boolean },
): boolean {
  if (expr.type === "leaf") return evaluateLeaf(expr, node);

  const left = evaluateExpr(expr.left, node);
  const right = evaluateExpr(expr.right, node);

  switch (expr.op) {
    case "AND":  return left && right;
    case "OR":   return left || right;
    case "XOR":  return left !== right;
    case "NOR":  return !(left || right);
    case "NAND": return !(left && right);
  }
}

function evaluateLeaf(
  leaf: QueryLeaf,
  node: { id: string; label: string; tags?: string[]; category?: string; filePath?: string; isTag?: boolean },
): boolean {
  const val = leaf.value.toLowerCase();

  switch (leaf.field) {
    case "tag": {
      const tags = node.tags ?? [];
      return leaf.exact
        ? tags.some(t => t.toLowerCase() === val)
        : tags.some(t => t.toLowerCase().includes(val));
    }
    case "category": {
      const cat = (node.category ?? "").toLowerCase();
      return leaf.exact ? cat === val : cat.includes(val);
    }
    case "path": {
      const fp = (node.filePath ?? "").toLowerCase();
      return leaf.exact ? fp === val : fp.includes(val);
    }
    case "id": {
      const id = node.id.toLowerCase();
      return leaf.exact ? id === val : id.includes(val);
    }
    case "isTag":
      return String(!!node.isTag) === val;
    case "label":
    default: {
      const lbl = node.label.toLowerCase();
      return leaf.exact ? lbl === val : lbl.includes(val);
    }
  }
}
```

**Step 4: テスト実行 → PASS 確認**

Run: `npx vitest run tests/query-expr.test.ts`
Expected: ALL PASS

**Step 5: コミット**

```bash
git add src/utils/query-expr.ts tests/query-expr.test.ts
git commit -m "feat: add QueryExpression AST types and evaluator"
```

---

## Task 2: `src/utils/query-expr.ts` — テキストパーサー

**Files:**
- Modify: `src/utils/query-expr.ts`
- Modify: `tests/query-expr.test.ts`

**Step 1: パーサーテストを追加**

`tests/query-expr.test.ts` に追加:
```typescript
import { evaluateExpr, parseQueryExpr, type QueryExpression, type QueryLeaf } from "../src/utils/query-expr";

describe("parseQueryExpr", () => {
  it("single field:value", () => {
    const expr = parseQueryExpr('tag:"character"');
    expect(expr).toEqual({ type: "leaf", field: "tag", value: "character" });
  });

  it("unquoted value", () => {
    const expr = parseQueryExpr("tag:character");
    expect(expr).toEqual({ type: "leaf", field: "tag", value: "character" });
  });

  it("bare value defaults to label field", () => {
    const expr = parseQueryExpr('"Alice"');
    expect(expr).toEqual({ type: "leaf", field: "label", value: "Alice" });
  });

  it("A AND B", () => {
    const expr = parseQueryExpr('tag:"character" AND category:"person"');
    expect(expr).toEqual({
      type: "branch", op: "AND",
      left: { type: "leaf", field: "tag", value: "character" },
      right: { type: "leaf", field: "category", value: "person" },
    });
  });

  it("A OR B AND C → A OR (B AND C) [AND binds tighter]", () => {
    const expr = parseQueryExpr('tag:"a" OR tag:"b" AND tag:"c"');
    expect(expr).toEqual({
      type: "branch", op: "OR",
      left: { type: "leaf", field: "tag", value: "a" },
      right: {
        type: "branch", op: "AND",
        left: { type: "leaf", field: "tag", value: "b" },
        right: { type: "leaf", field: "tag", value: "c" },
      },
    });
  });

  it("parentheses override precedence: (A OR B) AND C", () => {
    const expr = parseQueryExpr('(tag:"a" OR tag:"b") AND tag:"c"');
    expect(expr).toEqual({
      type: "branch", op: "AND",
      left: {
        type: "branch", op: "OR",
        left: { type: "leaf", field: "tag", value: "a" },
        right: { type: "leaf", field: "tag", value: "b" },
      },
      right: { type: "leaf", field: "tag", value: "c" },
    });
  });

  it("XOR, NOR, NAND operators", () => {
    const expr = parseQueryExpr('tag:"a" XOR tag:"b"');
    expect(expr).toEqual({
      type: "branch", op: "XOR",
      left: { type: "leaf", field: "tag", value: "a" },
      right: { type: "leaf", field: "tag", value: "b" },
    });
  });

  it("empty string returns null", () => {
    expect(parseQueryExpr("")).toBeNull();
    expect(parseQueryExpr("  ")).toBeNull();
  });

  it("complex nested: (A OR B) AND (C XOR D)", () => {
    const expr = parseQueryExpr('(tag:"a" OR tag:"b") AND (category:"c" XOR category:"d")');
    expect(expr!.type).toBe("branch");
    expect((expr as QueryBranch).op).toBe("AND");
  });
});
```

**Step 2: テスト実行 → FAIL 確認**

Run: `npx vitest run tests/query-expr.test.ts`
Expected: FAIL (parseQueryExpr not exported)

**Step 3: パーサー実装**

`src/utils/query-expr.ts` に追加:
```typescript
/**
 * Parse a query string into a QueryExpression AST.
 *
 * Grammar (precedence low→high):
 *   expr     = andExpr (("OR"|"NOR"|"XOR") andExpr)*
 *   andExpr  = atom (("AND"|"NAND") atom)*
 *   atom     = "(" expr ")" | leaf
 *   leaf     = field ":" quotedOrBare | quotedOrBare
 *
 * Returns null for empty/whitespace input.
 */
export function parseQueryExpr(input: string): QueryExpression | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return null;

  let pos = 0;

  function peek(): string | undefined { return tokens[pos]; }
  function advance(): string { return tokens[pos++]; }

  function parseExpr(): QueryExpression {
    let left = parseAndExpr();
    while (peek() === "OR" || peek() === "NOR" || peek() === "XOR") {
      const op = advance() as BoolOp;
      const right = parseAndExpr();
      left = { type: "branch", op, left, right };
    }
    return left;
  }

  function parseAndExpr(): QueryExpression {
    let left = parseAtom();
    while (peek() === "AND" || peek() === "NAND") {
      const op = advance() as BoolOp;
      const right = parseAtom();
      left = { type: "branch", op, left, right };
    }
    return left;
  }

  function parseAtom(): QueryExpression {
    if (peek() === "(") {
      advance(); // consume "("
      const expr = parseExpr();
      if (peek() === ")") advance(); // consume ")"
      return expr;
    }
    return parseLeaf();
  }

  function parseLeaf(): QueryLeaf {
    const tok = advance() ?? "";
    // Check for field:value pattern
    const colonIdx = tok.indexOf(":");
    if (colonIdx > 0) {
      const field = tok.slice(0, colonIdx);
      const rawVal = tok.slice(colonIdx + 1);
      return { type: "leaf", field, value: unquote(rawVal) };
    }
    // Bare value → label field
    return { type: "leaf", field: "label", value: unquote(tok) };
  }

  const result = parseExpr();
  return result;
}

/** Tokenize input: splits on whitespace but preserves quoted strings and parens */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < input.length) {
    // Skip whitespace
    if (input[i] === " " || input[i] === "\t") { i++; continue; }

    // Parentheses
    if (input[i] === "(" || input[i] === ")") {
      tokens.push(input[i]);
      i++;
      continue;
    }

    // Accumulate token (may contain field:"quoted value")
    let tok = "";
    while (i < input.length && input[i] !== " " && input[i] !== "\t" && input[i] !== "(" && input[i] !== ")") {
      if (input[i] === '"') {
        // Consume quoted string including quotes
        tok += input[i++]; // opening quote
        while (i < input.length && input[i] !== '"') tok += input[i++];
        if (i < input.length) tok += input[i++]; // closing quote
      } else {
        tok += input[i++];
      }
    }
    if (tok) tokens.push(tok);
  }
  return tokens;
}

function unquote(s: string): string {
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') return s.slice(1, -1);
  return s;
}
```

**Step 4: テスト実行 → PASS 確認**

Run: `npx vitest run tests/query-expr.test.ts`
Expected: ALL PASS

**Step 5: コミット**

```bash
git add src/utils/query-expr.ts tests/query-expr.test.ts
git commit -m "feat: add query expression text parser"
```

---

## Task 3: `src/utils/query-expr.ts` — AST → テキスト変換 (serialize)

**Files:**
- Modify: `src/utils/query-expr.ts`
- Modify: `tests/query-expr.test.ts`

**Step 1: テスト追加**

```typescript
import { evaluateExpr, parseQueryExpr, serializeExpr, type QueryExpression, type QueryLeaf, type QueryBranch } from "../src/utils/query-expr";

describe("serializeExpr", () => {
  it("leaf → field:\"value\"", () => {
    expect(serializeExpr({ type: "leaf", field: "tag", value: "character" })).toBe('tag:"character"');
  });

  it("label field omits field name", () => {
    expect(serializeExpr({ type: "leaf", field: "label", value: "Alice" })).toBe('"Alice"');
  });

  it("branch → left OP right", () => {
    const expr: QueryExpression = {
      type: "branch", op: "AND",
      left: { type: "leaf", field: "tag", value: "a" },
      right: { type: "leaf", field: "tag", value: "b" },
    };
    expect(serializeExpr(expr)).toBe('tag:"a" AND tag:"b"');
  });

  it("nested branches add parentheses when needed", () => {
    const expr: QueryExpression = {
      type: "branch", op: "AND",
      left: {
        type: "branch", op: "OR",
        left: { type: "leaf", field: "tag", value: "a" },
        right: { type: "leaf", field: "tag", value: "b" },
      },
      right: { type: "leaf", field: "tag", value: "c" },
    };
    expect(serializeExpr(expr)).toBe('(tag:"a" OR tag:"b") AND tag:"c"');
  });

  it("roundtrip: parse → serialize → parse gives same AST", () => {
    const input = '(tag:"a" OR tag:"b") AND category:"c"';
    const parsed = parseQueryExpr(input)!;
    const serialized = serializeExpr(parsed);
    const reparsed = parseQueryExpr(serialized)!;
    expect(reparsed).toEqual(parsed);
  });
});
```

**Step 2: テスト実行 → FAIL**

**Step 3: 実装**

`src/utils/query-expr.ts` に追加:
```typescript
const HIGH_PREC_OPS = new Set<BoolOp>(["AND", "NAND"]);

/**
 * Serialize a QueryExpression back to text form.
 * Adds parentheses only when a lower-precedence sub-expression
 * appears inside a higher-precedence context.
 */
export function serializeExpr(expr: QueryExpression): string {
  return serializeInner(expr, null);
}

function serializeInner(expr: QueryExpression, parentOp: BoolOp | null): string {
  if (expr.type === "leaf") {
    const val = `"${expr.value}"`;
    return expr.field === "label" ? val : `${expr.field}:${val}`;
  }

  const leftStr = serializeInner(expr.left, expr.op);
  const rightStr = serializeInner(expr.right, expr.op);
  const inner = `${leftStr} ${expr.op} ${rightStr}`;

  // Wrap in parens if this op has lower precedence than parent
  const needsParens = parentOp !== null
    && HIGH_PREC_OPS.has(parentOp)
    && !HIGH_PREC_OPS.has(expr.op);

  return needsParens ? `(${inner})` : inner;
}
```

**Step 4: テスト実行 → PASS**

**Step 5: コミット**

```bash
git add src/utils/query-expr.ts tests/query-expr.test.ts
git commit -m "feat: add query expression serializer with roundtrip support"
```

---

## Task 4: `src/types.ts` — GroupRule + GroupPreset 型定義

**Files:**
- Modify: `src/types.ts`

**Step 1: 型追加**

`ClusterGroupRule` 定義の後に追加:

```typescript
import type { QueryExpression } from "./utils/query-expr";

// ... (既存 ClusterGroupRule の後)

/** A group rule with boolean expression matching */
export interface GroupRule {
  expression: QueryExpression | null;  // null = match all
  color: string;
}

/** Common query applied across all groups — splits nodes by match pattern */
export interface CommonGroupQuery {
  expression: QueryExpression;
}

/** Preset applied on view load based on display state */
export interface GroupPreset {
  condition: {
    tagDisplay?: "node" | "enclosure";
    clusterGroupRules?: ClusterGroupRule[];
    layout?: LayoutType;
  };
  groups: GroupRule[];
  commonQuery?: CommonGroupQuery;
}
```

**Step 2: GraphViewsSettings に追加**

```typescript
// GraphViewsSettings に追加
groupPresets: GroupPreset[];

// DEFAULT_SETTINGS に追加
groupPresets: [],
```

**Step 3: ビルド確認**

Run: `npm run build`

**Step 4: コミット**

```bash
git add src/types.ts
git commit -m "feat: add GroupRule, GroupPreset, CommonGroupQuery types"
```

---

## Task 5: `src/views/PanelBuilder.ts` — PanelState + グループ UI 書き換え

**Files:**
- Modify: `src/views/PanelBuilder.ts`

**Step 1: import 更新**

```typescript
import type { QueryExpression } from "../utils/query-expr";
import { parseQueryExpr, serializeExpr } from "../utils/query-expr";
import type { GroupRule } from "../types";
```

**Step 2: PanelState 更新**

```typescript
// 旧:
groups: { query: string; color: string }[];

// 新:
groups: GroupRule[];
```

DEFAULT_PANEL の `groups: []` はそのまま（GroupRule[] も空配列）。

**Step 3: PanelCallbacks に `collectFieldSuggestions` 追加**

```typescript
export interface PanelCallbacks {
  // ... existing ...
  collectFieldSuggestions(): string[];
  collectValueSuggestions(field: string): string[];
}
```

**Step 4: `renderGroupList` を書き換え**

旧: 各グループに1つのテキスト入力
新: 各グループに式エディタ（行ベース + インデント）

```typescript
function renderGroupList(container: HTMLElement, panel: PanelState, cb: PanelCallbacks) {
  container.empty();
  panel.groups.forEach((g, i) => {
    const row = container.createDiv({ cls: "ngp-group-item" });

    // Color dot
    const colorDot = row.createDiv({ cls: "ngp-group-color" });
    colorDot.style.background = g.color;
    colorDot.addEventListener("click", () => {
      const next = DEFAULT_COLORS[(DEFAULT_COLORS.indexOf(g.color as typeof DEFAULT_COLORS[number]) + 1) % DEFAULT_COLORS.length];
      g.color = next;
      colorDot.style.background = next;
      cb.doRender();
    });

    // Expression text input with parse-on-blur
    const exprInput = row.createEl("input", { cls: "ngp-group-query", type: "text", placeholder: 'tag:"character" AND category:"person"' });
    exprInput.value = g.expression ? serializeExpr(g.expression) : "";
    exprInput.addEventListener("input", () => {
      const parsed = parseQueryExpr(exprInput.value);
      g.expression = parsed;
      cb.doRender();
    });

    // Expand button → opens row-based editor
    const expandBtn = row.createEl("span", { cls: "ngp-group-expand", text: "▼" });
    let editorEl: HTMLElement | null = null;
    expandBtn.addEventListener("click", () => {
      if (editorEl) {
        editorEl.remove();
        editorEl = null;
        expandBtn.textContent = "▼";
        return;
      }
      expandBtn.textContent = "▲";
      editorEl = container.createDiv({ cls: "ngp-expr-editor" });
      renderExprEditor(editorEl, g, cb);
    });

    // Remove button
    const rm = row.createEl("span", { cls: "ngp-group-remove", text: "\u00D7" });
    rm.addEventListener("click", () => {
      panel.groups.splice(i, 1);
      renderGroupList(container, panel, cb);
      cb.doRender();
    });
  });
}
```

**Step 5: `renderExprEditor` — 行ベース式エディタ**

各行 = 1 QueryLeaf。インデントレベルで括弧を表現。行間に演算子ドロップダウン。

```typescript
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
  flattenExpr(expr.left, indent, opBefore, rows);
  // Right side: if it's a branch with lower precedence at same level, increase indent
  const rightIndent = expr.right.type === "branch" ? indent + 1 : indent;
  flattenExpr(expr.right, indent, expr.op, rows);
}

function rowsToExpr(rows: ExprRow[]): QueryExpression | null {
  if (rows.length === 0) return null;
  // Group by indent levels to build AST
  return buildExprFromRows(rows, 0, rows.length - 1);
}

function buildExprFromRows(rows: ExprRow[], start: number, end: number): QueryExpression | null {
  if (start > end) return null;
  if (start === end) {
    return { type: "leaf", field: rows[start].field, value: rows[start].value };
  }

  // Find the lowest-precedence operator at the minimum indent level
  let minIndent = Infinity;
  for (let i = start; i <= end; i++) {
    if (rows[i].indent < minIndent) minIndent = rows[i].indent;
  }

  // Find split point: last low-precedence op at minIndent
  let splitIdx = -1;
  let splitIsLow = false;
  const LOW_OPS = new Set<BoolOp>(["OR", "NOR", "XOR"]);

  for (let i = start + 1; i <= end; i++) {
    if (rows[i].indent !== minIndent || !rows[i].opBefore) continue;
    const isLow = LOW_OPS.has(rows[i].opBefore!);
    if (isLow || !splitIsLow) {
      splitIdx = i;
      splitIsLow = isLow;
    }
  }

  if (splitIdx === -1) {
    // All same indent, no operators → just first leaf
    return { type: "leaf", field: rows[start].field, value: rows[start].value };
  }

  const left = buildExprFromRows(rows, start, splitIdx - 1);
  const right = buildExprFromRows(rows, splitIdx, end);
  if (!left || !right) return left || right;

  return { type: "branch", op: rows[splitIdx].opBefore!, left, right };
}

function renderExprEditor(container: HTMLElement, group: GroupRule, cb: PanelCallbacks) {
  const rows = exprToRows(group.expression);

  function rebuild() {
    group.expression = rowsToExpr(rows);
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
      rowEl.style.paddingLeft = `${row.indent * 20}px`;

      // Field input with suggestions
      const fieldInput = rowEl.createEl("input", { cls: "ngp-expr-field", type: "text", placeholder: "field" });
      fieldInput.value = row.field;
      fieldInput.style.width = "80px";
      fieldInput.addEventListener("input", () => { row.field = fieldInput.value; rebuild(); });

      rowEl.createEl("span", { text: " : " });

      // Value input with suggestions
      const valInput = rowEl.createEl("input", { cls: "ngp-expr-value", type: "text", placeholder: "value" });
      valInput.value = row.value;
      valInput.style.flex = "1";
      valInput.addEventListener("input", () => { row.value = valInput.value; rebuild(); });

      // Indent buttons
      const indentBtn = rowEl.createEl("span", { cls: "ngp-expr-btn", text: "→" });
      indentBtn.addEventListener("click", () => { row.indent++; rebuild(); });
      const dedentBtn = rowEl.createEl("span", { cls: "ngp-expr-btn", text: "←" });
      dedentBtn.addEventListener("click", () => { row.indent = Math.max(0, row.indent - 1); rebuild(); });

      // Delete button
      const rmBtn = rowEl.createEl("span", { cls: "ngp-group-remove", text: "×" });
      rmBtn.addEventListener("click", () => { rows.splice(i, 1); if (rows.length > 0 && rows[0].opBefore) rows[0].opBefore = null; rebuild(); });
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
```

**Step 6: 新規グループ作成を GroupRule に合わせる**

```typescript
// 旧:
panel.groups.push({ query: "", color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length] });

// 新:
panel.groups.push({ expression: null, color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length] });
```

**Step 7: ビルド確認**

Run: `npm run build`

**Step 8: コミット**

```bash
git add src/views/PanelBuilder.ts
git commit -m "feat: replace group text query with boolean expression UI"
```

---

## Task 6: `src/views/GraphViewContainer.ts` — AST 評価でノード色決定 + プリセット適用

**Files:**
- Modify: `src/views/GraphViewContainer.ts`

**Step 1: import 追加**

```typescript
import { evaluateExpr } from "../utils/query-expr";
import type { GroupPreset } from "../types";
```

**Step 2: `nodeColor` をAST評価に書き換え**

```typescript
// 旧 (L1412-1413):
for (const grp of this.panel.groups) {
  if (grp.query && n.label.toLowerCase().includes(grp.query)) return cssColorToHex(grp.color);
}

// 新:
for (const grp of this.panel.groups) {
  if (grp.expression && evaluateExpr(grp.expression, n)) return cssColorToHex(grp.color);
}
```

**Step 3: PanelCallbacks に suggestion 関数を実装**

```typescript
collectFieldSuggestions: () => {
  const fields = new Set<string>(["label", "tag", "category", "path", "id", "isTag"]);
  // Could be extended with frontmatter fields in the future
  return [...fields];
},
collectValueSuggestions: (field: string) => {
  const values = new Set<string>();
  for (const pn of this.pixiNodes.values()) {
    const n = pn.data;
    switch (field) {
      case "tag": (n.tags ?? []).forEach(t => values.add(t)); break;
      case "category": if (n.category) values.add(n.category); break;
      case "label": values.add(n.label); break;
      case "path": if (n.filePath) values.add(n.filePath); break;
      case "id": values.add(n.id); break;
    }
  }
  return [...values].sort();
},
```

**Step 4: コンストラクタにプリセット適用ロジックを追加**

`doRender()` の先頭（データ構築後、色適用前）にプリセットマッチを追加:

```typescript
// In constructor or onOpen, after panel initialization:
private applyGroupPresets() {
  const presets = this.plugin.settings.groupPresets ?? [];
  for (const preset of presets) {
    const cond = preset.condition;
    if (cond.layout && cond.layout !== this.currentLayout) continue;
    if (cond.tagDisplay && cond.tagDisplay !== this.panel.tagDisplay) continue;
    if (cond.clusterGroupRules) {
      const cur = JSON.stringify(this.panel.clusterGroupRules);
      const exp = JSON.stringify(cond.clusterGroupRules);
      if (cur !== exp) continue;
    }
    // Match found — apply preset
    this.panel.groups = preset.groups.map(g => ({ ...g, expression: g.expression ? { ...g.expression } : null }));
    break;
  }
}
```

初期化チェーン（`doRender` の最初の呼び出し前）で `this.applyGroupPresets()` を呼ぶ。

**Step 5: ビルド確認**

Run: `npm run build`

**Step 6: コミット**

```bash
git add src/views/GraphViewContainer.ts
git commit -m "feat: evaluate group expressions for node color + preset loading"
```

---

## Task 7: `src/settings.ts` — プリセット永続化 UI

**Files:**
- Modify: `src/settings.ts`

**Step 1: プリセット設定セクション追加**

「Default Cluster Group Rules」セクションの直前に追加:

```typescript
containerEl.createEl("h3", { text: "Group Presets" });

const gpDesc = containerEl.createEl("p", {
  text: 'JSON array of presets. Each: { "condition": { "layout": "force", ... }, "groups": [{ "expression": {...}, "color": "#hex" }] }',
  cls: "setting-item-description",
});
gpDesc.style.fontSize = "0.85em";
gpDesc.style.marginBottom = "8px";

const gpTextarea = containerEl.createEl("textarea");
gpTextarea.style.width = "100%";
gpTextarea.style.minHeight = "120px";
gpTextarea.style.fontFamily = "monospace";
gpTextarea.style.fontSize = "0.85em";
gpTextarea.value = JSON.stringify(this.plugin.settings.groupPresets ?? [], null, 2);

const gpStatus = containerEl.createEl("div");
gpStatus.style.fontSize = "0.85em";
gpStatus.style.marginTop = "4px";

gpTextarea.addEventListener("input", async () => {
  try {
    const parsed = JSON.parse(gpTextarea.value);
    if (!Array.isArray(parsed)) throw new Error("Must be an array");
    this.plugin.settings.groupPresets = parsed;
    await this.plugin.saveSettings();
    gpStatus.textContent = "Saved.";
    gpStatus.style.color = "var(--text-success)";
  } catch (e) {
    gpStatus.textContent = `Invalid JSON: ${(e as Error).message}`;
    gpStatus.style.color = "var(--text-error)";
  }
});
```

**Step 2: ビルド確認**

Run: `npm run build`

**Step 3: コミット**

```bash
git add src/settings.ts
git commit -m "feat: add group presets persistence in settings"
```

---

## Task 8: PanelBuilder — 「現在のグループを保存」ボタン

**Files:**
- Modify: `src/views/PanelBuilder.ts`

**Step 1: PanelCallbacks に `saveGroupPreset` を追加**

```typescript
export interface PanelCallbacks {
  // ... existing ...
  saveGroupPreset(): void;
}
```

**Step 2: 「グループ」セクションに保存ボタンを追加**

```typescript
// renderGroupList の後、addBtn の後に:
const saveBtn = body.createEl("button", { cls: "ngp-add-group", text: "プリセットとして保存" });
saveBtn.addEventListener("click", () => cb.saveGroupPreset());
```

**Step 3: GVC に `saveGroupPreset` 実装**

```typescript
saveGroupPreset: () => {
  const preset: GroupPreset = {
    condition: {
      layout: this.currentLayout,
      tagDisplay: this.panel.tagDisplay,
      clusterGroupRules: [...this.panel.clusterGroupRules],
    },
    groups: this.panel.groups.map(g => ({ ...g })),
  };
  this.plugin.settings.groupPresets.push(preset);
  this.plugin.saveSettings();
},
```

**Step 4: ビルド確認**

Run: `npm run build`

**Step 5: コミット**

```bash
git add src/views/PanelBuilder.ts src/views/GraphViewContainer.ts
git commit -m "feat: save current groups as preset button"
```

---

## Task 9: フィルタクエリ（検索バー + Directional Gravity）を QueryExpression 対応

**Files:**
- Modify: `src/views/GraphViewContainer.ts`
- Modify: `src/views/PanelBuilder.ts`
- Modify: `src/layouts/force.ts`
- Modify: `tests/query-expr.test.ts`

**Step 1: `matchesFilter` を `evaluateExpr` ベースに置換**

`src/layouts/force.ts` の `matchesFilter` を更新し、文字列フィルタを `parseQueryExpr` でパースしてから `evaluateExpr` で評価するようにする:

```typescript
import { parseQueryExpr, evaluateExpr } from "../utils/query-expr";

export function matchesFilter(node: GraphNode, filter: string): boolean {
  if (filter === "*") return true;
  const expr = parseQueryExpr(filter);
  return evaluateExpr(expr, node);
}
```

これにより Directional Gravity の `rule.filter` がそのまま新構文に対応する。

**Step 2: 検索バー (`applySearch`) を QueryExpression 対応**

`applySearch` のテキスト部分（`hop:` を除外した残り）を `parseQueryExpr` でパースし、`evaluateExpr` で評価するように更新:

```typescript
// 旧:
const textMatch = hasText && pn.data.label.toLowerCase().includes(textParts[0]);

// 新:
import { parseQueryExpr, evaluateExpr } from "../utils/query-expr";
// ...
const searchExpr = hasText ? parseQueryExpr(trimmed) : null;
// ...
const textMatch = searchExpr !== null && evaluateExpr(searchExpr, pn.data);
```

`hop:` 構文は独立したまま維持（QueryExpression とは別処理）。

**Step 3: テスト追加**

`tests/query-expr.test.ts` に `matchesFilter` 互換性テストを追加:

```typescript
describe("matchesFilter compatibility", () => {
  it("tag:character matches node with character tag", () => {
    const expr = parseQueryExpr('tag:"character"');
    const node = makeNode({ tags: ["character"] });
    expect(evaluateExpr(expr, node)).toBe(true);
  });

  it("tag:character AND category:person", () => {
    const expr = parseQueryExpr('tag:"character" AND category:"person"');
    const node = makeNode({ tags: ["character"], category: "person" });
    expect(evaluateExpr(expr, node)).toBe(true);
  });
});
```

**Step 4: ビルド + テスト**

Run: `npm run build && npx vitest run`

**Step 5: コミット**

```bash
git add src/layouts/force.ts src/views/GraphViewContainer.ts tests/query-expr.test.ts
git commit -m "feat: filter query and search bar use QueryExpression syntax"
```

---

## Task 10: テスト全体実行 + 最終検証

**Step 1: 全テスト実行**

Run: `npm run build && npx vitest run`
Expected: 全テストパス

**Step 2: 確認事項**

- 空の expression → 全ノードマッチ（色適用なし → 従来と同等）
- テキスト入力 `tag:"character" AND category:"person"` → パースされてAST評価
- 行エディタのインデントで括弧が正しく形成される
- プリセット保存 → 次回読み込み時に自動適用
- 設定 JSON textarea でプリセットの直接編集が可能
- 検索バーで `tag:"character" OR label:"Alice"` が動作
- Directional Gravity フィルタで新構文が使用可能
- `matchesFilter("*", node)` → 全ノードマッチ（後方互換）
