export type BoolOp = "AND" | "OR" | "XOR" | "NOR" | "NAND";

export interface QueryLeaf {
	type: "leaf";
	field: string;
	value: string;
	exact?: boolean;
	fuzzy?: boolean;
}

export interface QueryNot {
	type: "not";
	child: QueryExpression;
}

export interface QueryBranch {
	type: "branch";
	op: BoolOp;
	left: QueryExpression;
	right: QueryExpression;
}

export type QueryExpression = QueryLeaf | QueryBranch | QueryNot;

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
	node: {
		id: string;
		label: string;
		tags?: string[];
		category?: string;
		filePath?: string;
		isTag?: boolean;
		meta?: Record<string, unknown>;
	},
): boolean {
	if (expr.type === "leaf") return evaluateLeaf(expr, node);
	if (expr.type === "not") return !evaluateExpr(expr.child, node);

	const left = evaluateExpr(expr.left, node);
	const right = evaluateExpr(expr.right, node);

	switch (expr.op) {
		case "AND":
			return left && right;
		case "OR":
			return left || right;
		case "XOR":
			return left !== right;
		case "NOR":
			return !(left || right);
		case "NAND":
			return !(left && right);
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

	function peek(): string | undefined {
		return tokens[pos];
	}
	function advance(): string {
		return tokens[pos++];
	}

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
		if (peek() === "NOT") {
			advance(); // consume "NOT"
			const child = parseAtom();
			return { type: "not", child };
		}
		if (peek() === "(") {
			advance(); // consume "("
			const expr = parseExpr();
			if (peek() === ")") advance(); // consume ")"
			return expr;
		}
		return parseLeaf();
	}

	function parseLeaf(): QueryLeaf {
		let tok = advance() ?? "";
		// Fuzzy prefix: ~value or ~field:value
		let fuzzy = false;
		if (tok.startsWith("~")) {
			fuzzy = true;
			tok = tok.slice(1);
		}
		// Special keyword: bare "isTag" → isTag:true
		if (tok.toLowerCase() === "istag") {
			return { type: "leaf", field: "isTag", value: "true" };
		}
		// Check for field:value pattern
		const colonIdx = tok.indexOf(":");
		if (colonIdx > 0) {
			const field = tok.slice(0, colonIdx);
			const rawVal = tok.slice(colonIdx + 1);
			return { type: "leaf", field, value: unquote(rawVal), ...(fuzzy ? { fuzzy } : {}) };
		}
		// Bare value → label field
		return { type: "leaf", field: "label", value: unquote(tok), ...(fuzzy ? { fuzzy } : {}) };
	}

	return parseExpr();
}

const BOOL_OPS = new Set(["AND", "OR", "XOR", "NOR", "NAND", "NOT"]);

/** Normalize boolean operators to uppercase; pass through everything else */
function normalizeBoolOp(tok: string): string {
	const upper = tok.toUpperCase();
	return BOOL_OPS.has(upper) ? upper : tok;
}

/** Read a single token starting at position i, returning the token and next position */
function readToken(input: string, start: number): { tok: string; next: number } {
	let i = start;
	let tok = "";
	while (i < input.length && input[i] !== " " && input[i] !== "\t" && input[i] !== "(" && input[i] !== ")") {
		if (input[i] === '"') {
			tok += input[i++]; // opening quote
			while (i < input.length && input[i] !== '"') tok += input[i++];
			if (i < input.length) tok += input[i++]; // closing quote
		} else {
			tok += input[i++];
		}
	}
	return { tok, next: i };
}

/** Tokenize input: splits on whitespace but preserves quoted strings and parens */
function tokenize(input: string): string[] {
	const tokens: string[] = [];
	let i = 0;
	while (i < input.length) {
		if (input[i] === " " || input[i] === "\t") {
			i++;
			continue;
		}
		if (input[i] === "(" || input[i] === ")") {
			tokens.push(input[i]);
			i++;
			continue;
		}
		const { tok, next } = readToken(input, i);
		i = next;
		if (tok) tokens.push(normalizeBoolOp(tok));
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

	if (expr.type === "not") {
		return `NOT(${serializeInner(expr.child, null)})`;
	}

	const leftStr = serializeInner(expr.left, expr.op);
	const rightStr = serializeInner(expr.right, expr.op);
	const inner = `${leftStr} ${expr.op} ${rightStr}`;

	// Wrap in parens if this op has lower precedence than parent
	const needsParens = parentOp !== null && HIGH_PREC_OPS.has(parentOp) && !HIGH_PREC_OPS.has(expr.op);

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

/** Levenshtein距離（編集距離）— ファジーマッチ用 */
function levenshtein(a: string, b: string): number {
	const m = a.length,
		n = b.length;
	if (m === 0) return n;
	if (n === 0) return m;
	// 1行分のDPバッファで省メモリ
	let prev = Array.from({ length: n + 1 }, (_, i) => i);
	for (let i = 1; i <= m; i++) {
		const curr = [i];
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
		}
		prev = curr;
	}
	return prev[n];
}

/** ファジーマッチ: 編集距離が閾値以内、または部分文字列マッチ */
function fuzzyMatch(target: string, query: string): boolean {
	if (target.includes(query)) return true;
	// 閾値: クエリ長の30%（最低1）
	const threshold = Math.max(1, Math.floor(query.length * 0.3));
	// 短いクエリはtarget全体との距離、長いクエリはスライディングウィンドウ
	if (query.length <= 5) {
		return levenshtein(target, query) <= threshold;
	}
	// スライディングウィンドウ: targetの各位置でquery長の部分文字列と比較
	for (let i = 0; i <= target.length - query.length; i++) {
		if (levenshtein(target.substring(i, i + query.length), query) <= threshold) return true;
	}
	return false;
}

function evaluateLeaf(
	leaf: QueryLeaf,
	node: {
		id: string;
		label: string;
		tags?: string[];
		category?: string;
		filePath?: string;
		isTag?: boolean;
		meta?: Record<string, unknown>;
	},
): boolean {
	const val = leaf.value.toLowerCase();

	switch (leaf.field) {
		case "tag": {
			const tags = node.tags ?? [];
			if (leaf.fuzzy) return tags.some((t) => fuzzyMatch(t.toLowerCase(), val));
			return tags.some((t) => matchValue(t.toLowerCase(), val));
		}
		case "category": {
			const cat = (node.category ?? "").toLowerCase();
			if (cat && matchValue(cat, val)) return true;
			// Fallback to meta.category (frontmatter)
			const metaCat = resolveMetaValue(node.meta, "category");
			return metaCat.some((v) => matchValue(v.toLowerCase(), val));
		}
		case "path":
		case "file":
		case "folder": {
			const fp = (node.filePath ?? "").toLowerCase();
			if (leaf.fuzzy) return fuzzyMatch(fp, val);
			return leaf.exact ? matchValue(fp, val) : val.includes("*") ? matchValue(fp, val) : fp.includes(val);
		}
		case "id": {
			const id = node.id.toLowerCase();
			return matchValue(id, val);
		}
		case "isTag":
			return String(!!node.isTag) === val;
		case "label": {
			const lbl = node.label.toLowerCase();
			if (leaf.fuzzy) return fuzzyMatch(lbl, val);
			return leaf.exact ? matchValue(lbl, val) : val.includes("*") ? matchValue(lbl, val) : lbl.includes(val);
		}
		default: {
			// Frontmatter field lookup via node.meta
			const metaVal = resolveMetaValue(node.meta, leaf.field);
			if (metaVal.length === 0) return false;
			if (leaf.fuzzy) return metaVal.some((v) => fuzzyMatch(v.toLowerCase(), val));
			return metaVal.some((v) => matchValue(v.toLowerCase(), val));
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
	if (Array.isArray(current)) return current.map((v) => String(v));
	return [String(current)];
}
