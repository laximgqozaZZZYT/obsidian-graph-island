/**
 * Safe mathematical expression evaluator using recursive descent parsing.
 * No dynamic code generation (no eval/Function). Supports:
 *   - Arithmetic: +, -, *, /, %, ^ (power), unary minus, parentheses
 *   - Functions: sin, cos, tan, sqrt, abs, log, exp, floor, ceil, min, max, pow, atan2
 *   - Constants: pi, e, tau
 *   - Variables: t (normalized 0–1), i (index), n (count), v (raw value)
 */

// ---------------------------------------------------------------------------
// AST node types
// ---------------------------------------------------------------------------

export type ExprNode =
  | { type: "number"; value: number }
  | { type: "variable"; name: string }
  | { type: "unary"; op: "-"; arg: ExprNode }
  | { type: "binary"; op: "+" | "-" | "*" | "/" | "%" | "^"; left: ExprNode; right: ExprNode }
  | { type: "call"; fn: string; args: ExprNode[] };

/** Variables available during expression evaluation */
export interface ExprVars {
  /** Normalized position 0–1 */
  t: number;
  /** Node index */
  i: number;
  /** Total node count */
  n: number;
  /** Raw axis value */
  v: number;
}

// ---------------------------------------------------------------------------
// Built-in functions and constants
// ---------------------------------------------------------------------------

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  log: Math.log,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  atan2: Math.atan2,
};

const VARIABLE_NAMES = new Set(["t", "i", "n", "v"]);

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
  | { type: "number"; value: number }
  | { type: "ident"; name: string }
  | { type: "op"; op: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comma" }
  | { type: "eof" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  const len = input.length;

  while (pos < len) {
    const ch = input[pos];

    // Skip whitespace
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      pos++;
      continue;
    }

    // Number literal (including decimals like .5)
    if ((ch >= "0" && ch <= "9") || (ch === "." && pos + 1 < len && input[pos + 1] >= "0" && input[pos + 1] <= "9")) {
      let numStr = "";
      while (pos < len && ((input[pos] >= "0" && input[pos] <= "9") || input[pos] === ".")) {
        numStr += input[pos++];
      }
      tokens.push({ type: "number", value: parseFloat(numStr) });
      continue;
    }

    // Identifier (function, variable, constant)
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      let name = "";
      while (pos < len && ((input[pos] >= "a" && input[pos] <= "z") || (input[pos] >= "A" && input[pos] <= "Z") || (input[pos] >= "0" && input[pos] <= "9") || input[pos] === "_")) {
        name += input[pos++];
      }
      tokens.push({ type: "ident", name: name.toLowerCase() });
      continue;
    }

    // Operators
    if ("+-*/%^".includes(ch)) {
      tokens.push({ type: "op", op: ch });
      pos++;
      continue;
    }

    if (ch === "(") { tokens.push({ type: "lparen" }); pos++; continue; }
    if (ch === ")") { tokens.push({ type: "rparen" }); pos++; continue; }
    if (ch === ",") { tokens.push({ type: "comma" }); pos++; continue; }

    throw new ExprError(`Unexpected character: '${ch}'`);
  }

  tokens.push({ type: "eof" });
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser (recursive descent)
// ---------------------------------------------------------------------------
// Precedence (low to high):
//   additive: + -
//   multiplicative: * / %
//   power: ^ (right-associative)
//   unary: -
//   primary: number, variable, constant, function call, (expr)

export class ExprError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExprError";
  }
}

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: string): Token {
    const tok = this.advance();
    if (tok.type !== type) {
      throw new ExprError(`Expected ${type}, got ${tok.type}`);
    }
    return tok;
  }

  parse(): ExprNode {
    const node = this.parseAdditive();
    if (this.peek().type !== "eof") {
      throw new ExprError(`Unexpected token after expression`);
    }
    return node;
  }

  private parseAdditive(): ExprNode {
    let left = this.parseMultiplicative();
    while (this.peek().type === "op" && (this.peek() as { op: string }).op === "+" || this.peek().type === "op" && (this.peek() as { op: string }).op === "-") {
      const op = (this.advance() as { type: "op"; op: string }).op as "+" | "-";
      const right = this.parseMultiplicative();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): ExprNode {
    let left = this.parsePower();
    while (this.peek().type === "op" && ("*/%".includes((this.peek() as { op: string }).op))) {
      const op = (this.advance() as { type: "op"; op: string }).op as "*" | "/" | "%";
      const right = this.parsePower();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  private parsePower(): ExprNode {
    const base = this.parseUnary();
    if (this.peek().type === "op" && (this.peek() as { op: string }).op === "^") {
      this.advance();
      // Right-associative: parse power again
      const exp = this.parsePower();
      return { type: "binary", op: "^", left: base, right: exp };
    }
    return base;
  }

  private parseUnary(): ExprNode {
    if (this.peek().type === "op" && (this.peek() as { op: string }).op === "-") {
      this.advance();
      const arg = this.parseUnary();
      return { type: "unary", op: "-", arg };
    }
    // Allow unary +
    if (this.peek().type === "op" && (this.peek() as { op: string }).op === "+") {
      this.advance();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ExprNode {
    const tok = this.peek();

    // Number
    if (tok.type === "number") {
      this.advance();
      return { type: "number", value: tok.value };
    }

    // Parenthesized expression
    if (tok.type === "lparen") {
      this.advance();
      const node = this.parseAdditive();
      this.expect("rparen");
      return node;
    }

    // Identifier: variable, constant, or function call
    if (tok.type === "ident") {
      this.advance();
      const name = tok.name;

      // Function call
      if (this.peek().type === "lparen") {
        if (!FUNCTIONS[name]) {
          throw new ExprError(`Unknown function: ${name}`);
        }
        this.advance(); // consume (
        const args: ExprNode[] = [];
        if (this.peek().type !== "rparen") {
          args.push(this.parseAdditive());
          while (this.peek().type === "comma") {
            this.advance();
            args.push(this.parseAdditive());
          }
        }
        this.expect("rparen");
        return { type: "call", fn: name, args };
      }

      // Constant
      if (name in CONSTANTS) {
        return { type: "number", value: CONSTANTS[name] };
      }

      // Variable
      if (VARIABLE_NAMES.has(name)) {
        return { type: "variable", name };
      }

      throw new ExprError(`Unknown identifier: ${name}`);
    }

    throw new ExprError(`Unexpected token: ${tok.type}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a math expression string into an AST.
 * Throws ExprError on invalid input.
 */
export function parseExpr(input: string): ExprNode {
  if (!input.trim()) {
    throw new ExprError("Empty expression");
  }
  const tokens = tokenize(input);
  return new Parser(tokens).parse();
}

/**
 * Evaluate a parsed expression with the given variable bindings.
 * Returns a finite number (NaN/Infinity are clamped to 0).
 */
export function evalExpr(node: ExprNode, vars: ExprVars): number {
  const result = evalNode(node, vars);
  if (!Number.isFinite(result)) return 0;
  return result;
}

function evalNode(node: ExprNode, vars: ExprVars): number {
  switch (node.type) {
    case "number":
      return node.value;

    case "variable":
      return vars[node.name as keyof ExprVars] ?? 0;

    case "unary":
      return -evalNode(node.arg, vars);

    case "binary": {
      const l = evalNode(node.left, vars);
      const r = evalNode(node.right, vars);
      switch (node.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return r === 0 ? 0 : l / r;
        case "%": return r === 0 ? 0 : l % r;
        case "^": return Math.pow(l, r);
      }
      break;
    }

    case "call": {
      const fn = FUNCTIONS[node.fn];
      if (!fn) return 0;
      const args = node.args.map(a => evalNode(a, vars));
      return fn(...args);
    }
  }
  return 0;
}

/**
 * Validate an expression string. Returns null if valid, or an error message.
 */
export function validateExpr(input: string): string | null {
  try {
    parseExpr(input);
    return null;
  } catch (e) {
    return e instanceof ExprError ? e.message : String(e);
  }
}
