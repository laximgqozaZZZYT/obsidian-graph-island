# Group Query Boolean Expression + Preset Design

## Goal

1. グループの検索クエリを複数条件 + ブール演算（AND/OR/XOR/NOR/NAND）+ 括弧優先順位で指定可能にする
2. 共通クエリで全グループ横断の自動分割を実現する
3. 表示状態別のグループプリセットを初回読み込み時に適用し、設定に永続保存可能にする

## Data Model

### QueryExpression (AST)

```typescript
type BoolOp = "AND" | "OR" | "XOR" | "NOR" | "NAND";

interface QueryLeaf {
  type: "leaf";
  field: string;    // "tag", "category", "label", "path", "id", or custom frontmatter field
  value: string;    // match value
  exact?: boolean;  // true=exact, false=substring (default)
}

interface QueryBranch {
  type: "branch";
  op: BoolOp;
  left: QueryExpression;
  right: QueryExpression;
}

type QueryExpression = QueryLeaf | QueryBranch;
```

### GroupRule (replaces current `{ query: string; color: string }`)

```typescript
interface GroupRule {
  expression: QueryExpression | null;  // null = match all
  color: string;
}
```

### CommonGroupQuery

Applied across all groups. Match pattern combinations auto-generate groups.

```typescript
interface CommonGroupQuery {
  expression: QueryExpression;
}
```

### GroupPreset

```typescript
interface GroupPreset {
  condition: {
    tagDisplay?: "node" | "enclosure";
    clusterGroupRules?: ClusterGroupRule[];
    layout?: LayoutType;
  };
  groups: GroupRule[];
  commonQuery?: QueryExpression;
}
```

## Text Parser

Syntax: `field:"value" OP field:"value"` with parentheses.

```
tag:"protagonist" AND category:"character"
label:"Alice" OR (tag:"main-cast" AND category:"character")
```

- field省略時は `label` がデフォルト
- 引用符省略可: `tag:protagonist`
- 演算子優先順位: 括弧 > AND/NAND > OR/NOR/XOR

## UI

### Row-based input with indent-as-parentheses

```
[tag     ⌄] : [protagonist  ⌄]
     OR ▾
  [tag     ⌄] : [main-cast    ⌄]   ← indent = open paren
       AND ▾
  [category⌄] : [character    ⌄]   ← same indent = same paren
     AND ▾
[path     ⌄] : [chapters/    ⌄]   ← dedent = close paren
```

- field/value: free text input with autocomplete suggestions
  - field suggestions: collected from node attributes dynamically
  - value suggestions: collected from existing values for selected field
- Operator dropdown between rows
- `→` / `←` buttons to change indent (parenthesization)
- `＋` add row, `×` delete row

### Preset management

- "Save current groups" button in panel → saves to settings as a GroupPreset
- On view load: scan `settings.groupPresets`, apply first matching condition
- Settings tab: JSON textarea for groupPresets array

## Evaluation

`evaluateExpression(expr: QueryExpression, node: GraphNode, meta: NodeMeta): boolean`

- Leaf: check `node[field].includes(value)` or exact match
- Branch: evaluate left/right, combine with op
  - AND: left && right
  - OR: left || right
  - XOR: left !== right
  - NOR: !(left || right)
  - NAND: !(left && right)
