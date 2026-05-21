// Smoke tests for the query parser/evaluator (used by both WHERE and GROUP_BY).
import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const tmp = mkdtempSync(join(tmpdir(), "gim-query-"));
const bundlePath = join(tmp, "bundle.cjs");

await esbuild.build({
	entryPoints: [join(root, "src/query.ts")],
	bundle: true,
	platform: "node",
	format: "cjs",
	outfile: bundlePath,
	logLevel: "warning",
});

const mod = await import(bundlePath);
const { parseQuery, evalQuery, isMatched, substituteLabel } = mod;

let pass = 0;
let fail = 0;
const failures = [];
function assert(name, cond) {
	if (cond) pass++;
	else {
		fail++;
		failures.push(name);
	}
}
function file(opts) {
	return {
		path: opts.path ?? "x.md",
		tags: opts.tags ?? [],
		frontmatter: opts.fm ?? {},
	};
}

function expectParseError(text, label) {
	try {
		parseQuery(text);
		assert(label, false);
	} catch {
		assert(label, true);
	}
}

const bindingsOf = (r) => r.instances.map((m) => Object.fromEntries(m));
const matched = (r) => isMatched(r);

// Single atom: tag exact
{
	const q = parseQuery("tag:#wip");
	assert("tag exact match",
		matched(evalQuery(q, file({ tags: ["wip", "draft"] }))));
	assert("tag exact non-match",
		!matched(evalQuery(q, file({ tags: ["other"] }))));
}

// Single atom: tag ? — one instance PER tag
{
	const q = parseQuery("tag:?");
	const r = evalQuery(q, file({ tags: ["wip", "later"] }));
	assert("tag:? matches when tags present", matched(r));
	assert("tag:? returns one instance per tag", r.instances.length === 2);
	const tags = r.instances.map((m) => m.get("tag")).sort();
	assert("tag:? binds each tag", tags[0] === "later" && tags[1] === "wip");
	assert("tag:? unmatched when no tags",
		!matched(evalQuery(q, file({ tags: [] }))));
}

// folder / path field is rejected at parse time
expectParseError("folder:src/work", "folder: is rejected");
expectParseError("path:notes", "path: is rejected");
expectParseError("folder:?", "folder:? is rejected");

// frontmatter literal
{
	const q = parseQuery("status:draft");
	assert("fm match", matched(evalQuery(q, file({ fm: { status: "draft" } }))));
	assert("fm non-match different value",
		!matched(evalQuery(q, file({ fm: { status: "done" } }))));
	assert("fm non-match missing", !matched(evalQuery(q, file({ fm: {} }))));
}

// frontmatter array literal: matched if value is in array
{
	const q = parseQuery("category:novel");
	assert("fm array contains",
		matched(evalQuery(q, file({ fm: { category: ["novel", "draft"] } }))));
	assert("fm array doesn't contain",
		!matched(evalQuery(q, file({ fm: { category: ["other"] } }))));
}

// frontmatter array `?`: one instance per element
{
	const q = parseQuery("category:?");
	const r = evalQuery(q, file({ fm: { category: ["novel", "draft"] } }));
	assert("fm array ? splits", r.instances.length === 2);
	const cats = r.instances.map((m) => m.get("category")).sort();
	assert("fm array ? binds each", cats[0] === "draft" && cats[1] === "novel");
}

// AND combination (tag + frontmatter)
{
	const q = parseQuery("tag:#wip AND status:draft");
	assert("AND both true",
		matched(evalQuery(q, file({ tags: ["wip"], fm: { status: "draft" } }))));
	assert("AND first false",
		!matched(evalQuery(q, file({ tags: ["other"], fm: { status: "draft" } }))));
	assert("AND second false",
		!matched(evalQuery(q, file({ tags: ["wip"], fm: { status: "done" } }))));
}

// AND with two ?-atoms: cartesian product of instances
{
	const q = parseQuery("tag:? AND category:?");
	const r = evalQuery(q, file({ tags: ["A", "B"], fm: { category: ["X", "Y"] } }));
	assert("AND cartesian count", r.instances.length === 4);
	const pairs = bindingsOf(r).map((b) => `${b.tag},${b.category}`).sort();
	assert("AND cartesian pairs",
		pairs.join("|") === ["A,X", "A,Y", "B,X", "B,Y"].join("|"));
}

// OR combination — unions instances
{
	const q = parseQuery("tag:#wip OR tag:#draft");
	assert("OR first true",
		matched(evalQuery(q, file({ tags: ["wip"] }))));
	assert("OR second true",
		matched(evalQuery(q, file({ tags: ["draft"] }))));
	assert("OR both false",
		!matched(evalQuery(q, file({ tags: ["other"] }))));
}

// NOT
{
	const q = parseQuery("NOT tag:#wip");
	assert("NOT true when missing",
		matched(evalQuery(q, file({ tags: ["other"] }))));
	assert("NOT false when present",
		!matched(evalQuery(q, file({ tags: ["wip"] }))));
}

// Hyphen NOT
{
	const q = parseQuery("tag:? AND -status:archive");
	assert("hyphen-not excludes archive",
		!matched(evalQuery(q, file({ tags: ["x"], fm: { status: "archive" } }))));
	assert("hyphen-not allows elsewhere",
		matched(evalQuery(q, file({ tags: ["x"], fm: { status: "active" } }))));
}

// Grouping + precedence
{
	const q = parseQuery("(tag:#wip OR tag:#draft) AND -status:archive");
	assert("paren precedence wip+active",
		matched(evalQuery(q, file({ tags: ["wip"], fm: { status: "active" } }))));
	assert("paren precedence wip+archive",
		!matched(evalQuery(q, file({ tags: ["wip"], fm: { status: "archive" } }))));
	assert("paren precedence other",
		!matched(evalQuery(q, file({ tags: ["other"], fm: { status: "active" } }))));
}

// Label substitution
{
	assert("$tag substitution",
		substituteLabel("#$tag", new Map([["tag", "wip"]])) === "#wip");
	assert("$status substitution",
		substituteLabel("Status: $status", new Map([["status", "draft"]])) === "Status: draft");
	assert("unknown placeholder kept as-is",
		substituteLabel("Hello $missing", new Map()) === "Hello $missing");
	assert("multiple placeholders",
		substituteLabel("$status / $tag", new Map([["status", "a"], ["tag", "b"]])) === "a / b");
}

console.log(`query-smoke: ${pass} pass, ${fail} fail`);
if (fail > 0) {
	for (const f of failures) console.log("  FAIL:", f);
	process.exit(1);
}
process.exit(0);
