export type BoolOp = "AND" | "OR" | "XOR" | "NOR" | "NAND";

export interface QueryLeaf {
  type: "leaf";
  field: string;
  value: string;
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
  node: { id: string; label: string; tags?: string[]; category?: string; filePath?: string; isTag?: boolean; meta?: Record<string, unknown> },
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
    // Special keyword: bare "isTag" → isTag:true
    if (tok.toLowerCase() === "istag") {
      return { type: "leaf", field: "isTag", value: "true" };
    }
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

  return parseExpr();
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
    if (expr.field === "isTag") return "isTag";
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

/**
 * Match a value against a pattern.
 * - No wildcards: exact match
 * - Contains `*`: glob-style matching (e.g. "act*" matches "act1", "*act*" matches "character")
 */
function matchValue(target: string, pattern: string): boolean {
  if (!pattern.includes("*")) return target === pattern;
  // Convert glob pattern to regex: escape regex chars, then replace * with .*
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(target);
}

function evaluateLeaf(
  leaf: QueryLeaf,
  node: { id: string; label: string; tags?: string[]; category?: string; filePath?: string; isTag?: boolean; meta?: Record<string, unknown> },
): boolean {
  const val = leaf.value.toLowerCase();

  switch (leaf.field) {
    case "tag": {
      const tags = node.tags ?? [];
      return tags.some(t => matchValue(t.toLowerCase(), val));
    }
    case "category": {
      const cat = (node.category ?? "").toLowerCase();
      if (cat && matchValue(cat, val)) return true;
      // Fallback to meta.category (frontmatter)
      const metaCat = resolveMetaValue(node.meta, "category");
      return metaCat.some(v => matchValue(v.toLowerCase(), val));
    }
    case "path":
    case "file":
    case "folder": {
      const fp = (node.filePath ?? "").toLowerCase();
      return matchValue(fp, val);
    }
    case "id": {
      const id = node.id.toLowerCase();
      return matchValue(id, val);
    }
    case "isTag":
      return String(!!node.isTag) === val;
    case "label": {
      const lbl = node.label.toLowerCase();
      return matchValue(lbl, val);
    }
    default: {
      // Frontmatter field lookup via node.meta
      const metaVal = resolveMetaValue(node.meta, leaf.field);
      if (metaVal.length === 0) return false;
      return metaVal.some(v => matchValue(v.toLowerCase(), val));
    }
  }
}

/** Resolve a frontmatter field value to a list of strings (handles arrays, nested dot paths) */
function resolveMetaValue(meta: Record<string, unknown> | undefined, field: string): string[] {
  if (!meta) return [];
  // Support dot-notation for nested fields (e.g. "power.attack")
  let current: unknown = meta;
  for (const key of field.split(".")) {
    if (current == null || typeof current !== "object") return [];
    current = (current as Record<string, unknown>)[key];
  }
  if (current == null) return [];
  if (Array.isArray(current)) return current.map(v => String(v));
  return [String(current)];
}
