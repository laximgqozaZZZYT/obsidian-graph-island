# Ontology: Inheritance & Aggregation Support

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to express inheritance (is-a) and aggregation (has-a) relationships via frontmatter properties, `@`-prefixed inline Dataview fields, and nested tag hierarchy — then visualize them with distinct edge styles in the graph.

**Architecture:** Extend `EdgeType` and settings with ontology config. Add a `classifyRelation()` function in the parser that maps field names to relationship types. The inline parser gains `@` prefix detection. Nested tags (`#a/b/c`) automatically generate inheritance edges. The PIXI renderer draws inheritance as dashed lines with hollow triangle markers and aggregation as dotted lines with diamond markers.

**Tech Stack:** TypeScript, Obsidian API (metadataCache, frontmatterLinks), PIXI.js (Graphics API for custom edge rendering), d3-force (existing simulation)

---

## Task 1: Extend type definitions

**Files:**
- Modify: `src/types.ts`

**Step 1: Add `inheritance` and `aggregation` to EdgeType**

In `src/types.ts`, change the `EdgeType` union:

```typescript
export type EdgeType =
  | "link"
  | "tag"
  | "category"
  | "reference"
  | "hierarchy"
  | "semantic"
  | "inheritance"
  | "aggregation";
```

**Step 2: Add `OntologyConfig` interface and merge into settings**

Add after `EdgeType`:

```typescript
export interface OntologyConfig {
  inheritanceFields: string[];
  aggregationFields: string[];
  useTagHierarchy: boolean;
  customMappings: Record<string, "inheritance" | "aggregation">;
}

export const DEFAULT_ONTOLOGY: OntologyConfig = {
  inheritanceFields: ["parent", "extends", "up"],
  aggregationFields: ["contains", "parts", "has"],
  useTagHierarchy: true,
  customMappings: {},
};
```

Add `ontology` to `GraphViewsSettings` and `DEFAULT_SETTINGS`.

**Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build.

**Step 4: Commit**

```
feat(types): add EdgeType inheritance/aggregation and OntologyConfig
```

---

## Task 2: Add `classifyRelation()` and extend inline parser for `@` prefix

**Files:**
- Modify: `src/parsers/metadata-parser.ts`

**Step 1: Add `classifyRelation()` function**

Classify field names into ontology types via settings lookup.

**Step 2: Update `parseInlineFields` regex to `/@?[\w][\w\s-]*::/` and return `isOntology` flag**

**Step 3: Update edge creation in `buildGraphFromVault` to use `classifyRelation`**

**Step 4: Build and verify**

**Step 5: Commit**

```
feat(parser): classifyRelation + @-prefix inline ontology fields
```

---

## Task 3: Add nested tag hierarchy edges

**Files:**
- Modify: `src/parsers/metadata-parser.ts`

**Step 1: Add `buildTagHierarchyEdges()` function**

For nested tags like `#entity/character`, create inheritance edges between nodes.

**Step 2: Integrate into `buildGraphFromVault` (gated by `settings.ontology.useTagHierarchy`)**

**Step 3: Build and verify**

**Step 4: Commit**

```
feat(parser): nested tag hierarchy to inheritance edges
```

---

## Task 4: Distinct edge rendering for inheritance and aggregation

**Files:**
- Modify: `src/views/GraphViewContainer.ts`

**Step 1: Update `drawEdges()` with type-specific colors and alpha**

- inheritance: gray (0x9ca3af), alpha 0.6
- aggregation: blue (0x60a5fa), alpha 0.6

**Step 2: Add `drawEdgeMarker()` method**

- inheritance: hollow triangle at target (UML generalization)
- aggregation: hollow diamond at source (UML aggregation)

**Step 3: Build and verify**

**Step 4: Commit**

```
feat(renderer): distinct edge styles for inheritance/aggregation
```

---

## Task 5: Ontology settings UI

**Files:**
- Modify: `src/settings.ts`

**Step 1: Add ontology section with text inputs and toggle**

- Inheritance fields (comma-separated)
- Aggregation fields (comma-separated)
- Tag hierarchy toggle

**Step 2: Build and verify**

**Step 3: Commit**

```
feat(settings): ontology configuration UI
```

---

## Task 6: Add ontology edge filter toggles to graph panel

**Files:**
- Modify: `src/views/GraphViewContainer.ts`

**Step 1: Add `showInheritance` / `showAggregation` to PanelState**

**Step 2: Add toggle UI in buildPanel()**

**Step 3: Filter edges in drawEdges()**

**Step 4: Build and verify**

**Step 5: Commit**

```
feat(panel): ontology edge filter toggles
```

---

## Task 7: Final integration build and push

**Step 1: Full build**

**Step 2: Commit and push**

```
feat: ontology support - inheritance and aggregation via properties and @-prefixed inline fields
```
