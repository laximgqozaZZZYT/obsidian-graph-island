#!/usr/bin/env node
// Generate dead-exports-report.json by running ts-prune against tsconfig.json.
// Categorizes findings by top-level directory and flags GOD OBJECT files,
// plus annotates whether each export name is referenced from tests/ or e2e/
// (judgment material — ts-prune only sees production code).
//
// Usage:
//   node scripts/find-dead-exports.mjs
//
// Output: dead-exports-report.json at the repo root.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const REPORT_PATH = join(REPO_ROOT, "dead-exports-report.json");

const GOD_OBJECTS = new Set([
	"src/views/GraphViewContainer.ts",
	"src/views/PanelBuilder.ts",
	"src/views/EdgeRenderer.ts",
	"src/views/RenderPipeline.ts",
]);

// Order matters: most-specific prefix first.
const TOP_DIRS = [
	"src/utils",
	"src/views",
	"src/layouts",
	"src/parsers",
	"src/ui",
	"src/renderers",
	"src/interactions",
	"src/types",
	"src",
];

const TEST_ROOTS = ["tests", "e2e"];

function runTsPrune() {
	const args = ["dlx", "ts-prune", "-p", "tsconfig.json"];
	process.stderr.write(`[find-dead-exports] running: pnpm ${args.join(" ")}\n`);
	return execFileSync("pnpm", args, {
		cwd: REPO_ROOT,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		stdio: ["ignore", "pipe", "inherit"],
	});
}

function parseTsPrune(text) {
	const out = [];
	const re = /^(.+?):(\d+)\s*-\s*(.+?)(?:\s*\((used in module)\))?$/;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) continue;
		const m = line.match(re);
		if (!m) continue;
		out.push({
			filePath: m[1].replace(/\\/g, "/"),
			line: Number(m[2]),
			exportName: m[3].trim(),
			usedInModule: Boolean(m[4]),
		});
	}
	return out;
}

function listSourceFiles(absDir) {
	const out = [];
	const stack = [absDir];
	while (stack.length > 0) {
		const dir = stack.pop();
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const ent of entries) {
			const full = join(dir, ent.name);
			if (ent.isDirectory()) {
				if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
				stack.push(full);
				continue;
			}
			if (!ent.isFile()) continue;
			if (/\.(ts|tsx|mts|cts)$/.test(ent.name)) out.push(full);
		}
	}
	return out;
}

function buildCorpus(roots) {
	const corpus = [];
	for (const rel of roots) {
		const abs = join(REPO_ROOT, rel);
		try {
			if (!statSync(abs).isDirectory()) continue;
		} catch {
			continue;
		}
		for (const file of listSourceFiles(abs)) {
			let content;
			try {
				content = readFileSync(file, "utf8");
			} catch {
				continue;
			}
			corpus.push({
				path: relative(REPO_ROOT, file).replace(/\\/g, "/"),
				content,
			});
		}
	}
	return corpus;
}

function escapeRegex(str) {
	return str.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function findReferencingFiles(corpus, name) {
	const re = new RegExp(`\\b${escapeRegex(name)}\\b`);
	const hits = [];
	for (const { path, content } of corpus) {
		if (re.test(content)) hits.push(path);
	}
	return hits;
}

function categorize(filePath) {
	if (GOD_OBJECTS.has(filePath)) return "GOD_OBJECTS";
	for (const dir of TOP_DIRS) {
		if (filePath === dir || filePath.startsWith(`${dir}/`)) return dir;
	}
	return "other";
}

function main() {
	const tsPruneOutput = runTsPrune();
	const entries = parseTsPrune(tsPruneOutput);
	process.stderr.write(`[find-dead-exports] parsed ${entries.length} entries\n`);

	process.stderr.write(`[find-dead-exports] scanning ${TEST_ROOTS.join(", ")} for references...\n`);
	const testCorpora = TEST_ROOTS.map((root) => ({
		root,
		corpus: buildCorpus([root]),
	}));

	const annotated = entries.map((e) => {
		const refsByRoot = {};
		for (const { root, corpus } of testCorpora) {
			refsByRoot[root] = findReferencingFiles(corpus, e.exportName);
		}
		const referencedInAnyTest = Object.values(refsByRoot).some((arr) => arr.length > 0);
		return {
			...e,
			category: categorize(e.filePath),
			isGodObject: GOD_OBJECTS.has(e.filePath),
			referencedInTestsCount: refsByRoot.tests?.length ?? 0,
			referencedInE2ECount: refsByRoot.e2e?.length ?? 0,
			testOnlyCandidate: !e.usedInModule && referencedInAnyTest,
		};
	});

	const byCategory = {};
	const byFile = {};
	for (const e of annotated) {
		if (!byCategory[e.category]) {
			byCategory[e.category] = { count: 0, files: new Set() };
		}
		byCategory[e.category].count += 1;
		byCategory[e.category].files.add(e.filePath);

		if (!byFile[e.filePath]) {
			byFile[e.filePath] = {
				count: 0,
				category: e.category,
				isGodObject: e.isGodObject,
				entries: [],
			};
		}
		byFile[e.filePath].count += 1;
		byFile[e.filePath].entries.push({
			line: e.line,
			exportName: e.exportName,
			usedInModule: e.usedInModule,
			referencedInTestsCount: e.referencedInTestsCount,
			referencedInE2ECount: e.referencedInE2ECount,
			testOnlyCandidate: e.testOnlyCandidate,
		});
	}
	for (const info of Object.values(byFile)) {
		info.entries.sort((a, b) => a.line - b.line);
	}

	const categories = {};
	for (const [name, info] of Object.entries(byCategory)) {
		categories[name] = { count: info.count, fileCount: info.files.size };
	}

	const filesRanked = Object.entries(byFile)
		.map(([file, info]) => ({ file, count: info.count, category: info.category }))
		.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));

	const usedInModuleCount = annotated.filter((e) => e.usedInModule).length;
	const testOnlyCandidateCount = annotated.filter((e) => e.testOnlyCandidate).length;
	const trueDeadCount = annotated.length - usedInModuleCount - testOnlyCandidateCount;

	const report = {
		generatedAt: new Date().toISOString(),
		tool: "ts-prune",
		tsconfig: "tsconfig.json",
		totals: {
			entries: annotated.length,
			usedInModule: usedInModuleCount,
			testOnlyCandidate: testOnlyCandidateCount,
			trueDead: trueDeadCount,
		},
		notes: [
			"usedInModule=true: ts-prune found in-file references only — exporting may be unnecessary, but the symbol itself is alive.",
			"testOnlyCandidate=true: name appears in tests/ or e2e/ but not in production code per ts-prune. Verify manually — same identifier may collide across modules.",
			"trueDead = entries - usedInModule - testOnlyCandidate. These are the strongest deletion candidates.",
			`GOD_OBJECTS category covers: ${[...GOD_OBJECTS].join(", ")} — handled separately per CLAUDE.md ratchet policy.`,
		],
		categories,
		filesRanked,
		byFile,
	};

	writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	process.stderr.write(
		`[find-dead-exports] wrote ${relative(REPO_ROOT, REPORT_PATH)} ` +
			`(entries=${annotated.length}, usedInModule=${usedInModuleCount}, ` +
			`testOnlyCandidate=${testOnlyCandidateCount}, trueDead=${trueDeadCount})\n`,
	);
}

main();
