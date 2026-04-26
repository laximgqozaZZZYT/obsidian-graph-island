#!/usr/bin/env node
// generate-verify-report.mjs — Read .verify-data.json and write verify-report.md.
//
// Usage: node scripts/generate-verify-report.mjs
//
// Inputs:
//   .verify-data.json  — produced by scripts/collect-verify-data.mjs (subtask-1)
//   vitest.config.ts   — source of coverage thresholds (dynamic, not hardcoded)
//
// Output:
//   verify-report.md   — completely overwritten (no append), with sections:
//     1. Line count check
//     2. Lint / Format
//     3. Test
//     4. Coverage
//     5. God Object Policy
//     6. Acceptance criteria (582-570 parent task)
//   Final line: "**総合判定: PASS**" or "**総合判定: FAIL**"

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const VERIFY_DATA = resolve(REPO_ROOT, ".verify-data.json");
const VITEST_CONFIG = resolve(REPO_ROOT, "vitest.config.ts");
const REPORT_PATH = resolve(REPO_ROOT, "verify-report.md");

function die(msg) {
	console.error(`generate-verify-report: ${msg}`);
	process.exit(1);
}

if (!existsSync(VERIFY_DATA)) {
	die(`missing ${VERIFY_DATA} — run collect-verify-data first (subtask-1)`);
}

let data;
try {
	data = JSON.parse(readFileSync(VERIFY_DATA, "utf8"));
} catch (err) {
	die(`failed to parse .verify-data.json: ${err.message}`);
}

function parseCoverageThresholds(configPath) {
	if (!existsSync(configPath)) die(`missing ${configPath}`);
	const src = readFileSync(configPath, "utf8");
	const pick = (key) => {
		const m = new RegExp(`${key}\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`).exec(src);
		return m ? Number(m[1]) : null;
	};
	const t = {
		s: pick("statements"),
		b: pick("branches"),
		f: pick("functions"),
		l: pick("lines"),
	};
	for (const [k, v] of Object.entries(t)) {
		if (v == null) die(`could not find coverage threshold "${k}" in vitest.config.ts`);
	}
	return t;
}

const thresholds = parseCoverageThresholds(VITEST_CONFIG);

function tokyoTimestamp() {
	const fmt = new Intl.DateTimeFormat("sv-SE", {
		timeZone: "Asia/Tokyo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
	return fmt.format(new Date());
}

const verdict = (ok) => (ok ? "PASS" : "FAIL");

function renderGodObjectTable(rows) {
	const lines = [
		"| File | Current | Max Allowed | Diff | 判定 |",
		"|------|--------:|------------:|-----:|:----:|",
	];
	for (const r of rows) {
		const diffStr = `${r.diff >= 0 ? "+" : ""}${r.diff}`;
		lines.push(`| \`${r.file}\` | ${r.current} | ${r.max} | ${diffStr} | ${verdict(r.pass)} |`);
	}
	return lines.join("\n");
}

function renderCoverageTable(cov, th) {
	const row = (label, key) => {
		const v = cov?.[key];
		const t = th[key];
		const ok = typeof v === "number" && v >= t;
		const measured = typeof v === "number" ? v.toFixed(2) : "N/A";
		return `| ${label} | ${t}% | ${measured}% | ${typeof v === "number" ? verdict(ok) : "N/A"} |`;
	};
	return [
		"| Metric | Threshold | Measured | 判定 |",
		"|--------|----------:|---------:|:----:|",
		row("Statements (S)", "s"),
		row("Branches (B)", "b"),
		row("Functions (F)", "f"),
		row("Lines (L)", "l"),
	].join("\n");
}

const godObjects = Array.isArray(data.godObjects) ? data.godObjects : [];
const godObjectsPass = godObjects.length > 0 && godObjects.every((r) => r.pass === true);

const lintPass = data.lint?.pass === true;
const formatPass = data.format?.pass === true;

const tests = data.tests ?? {};
const testsPass =
	typeof tests.failed === "number" &&
	tests.failed === 0 &&
	typeof tests.total === "number" &&
	tests.total > 0;

const coverage = data.coverage ?? {};
const coveragePass =
	typeof coverage.s === "number" &&
	typeof coverage.b === "number" &&
	typeof coverage.f === "number" &&
	typeof coverage.l === "number" &&
	coverage.s >= thresholds.s &&
	coverage.b >= thresholds.b &&
	coverage.f >= thresholds.f &&
	coverage.l >= thresholds.l;

const acceptance = [
	{ label: "行数チェック (4 God Object が Max Allowed 以下)", pass: godObjectsPass },
	{ label: "`pnpm lint` PASS", pass: lintPass },
	{ label: "`pnpm format:check` PASS", pass: formatPass },
	{ label: "`pnpm test` 全 PASS / FAIL=0", pass: testsPass },
	{ label: "カバレッジしきい値 (S/B/F/L) 到達", pass: coveragePass },
	{ label: "God Object Policy 違反なし", pass: godObjectsPass },
];
const overallPass = acceptance.every((a) => a.pass);

const out = [];
out.push(`# Verify Report — 582-570 親タスク Acceptance Check`);
out.push("");
out.push(`- 生成日時 (Asia/Tokyo): ${tokyoTimestamp()}`);
out.push(`- 入力: \`.verify-data.json\``);
out.push("");

out.push("## 行数チェック");
if (godObjects.length === 0) {
	out.push("_データなし (`.verify-data.json` の `godObjects` が空)_");
} else {
	out.push(renderGodObjectTable(godObjects));
}
out.push("");

out.push("## Lint / Format");
out.push("| チェック | 判定 |");
out.push("|----------|:----:|");
out.push(`| \`pnpm lint\` | ${verdict(lintPass)} |`);
out.push(`| \`pnpm format:check\` | ${verdict(formatPass)} |`);
out.push("");

out.push("## Test");
out.push("| 指標 | 値 |");
out.push("|------|---:|");
out.push(`| 総数 | ${tests.total ?? "N/A"} |`);
out.push(`| PASS | ${tests.passed ?? "N/A"} |`);
out.push(`| FAIL | ${tests.failed ?? "N/A"} |`);
out.push(`| 判定 | ${verdict(testsPass)} |`);
out.push("");

out.push("## Coverage");
out.push(renderCoverageTable(coverage, thresholds));
out.push("");
out.push(`- 総合判定: **${verdict(coveragePass)}**`);
out.push("");

out.push("## God Object Policy");
if (godObjects.length === 0) {
	out.push("- データなし → 判定 **FAIL**");
} else {
	const offenders = godObjects.filter((r) => r.pass !== true);
	if (offenders.length === 0) {
		out.push("- すべての God Object が Max Allowed 以下 → **PASS**");
	} else {
		out.push("- 以下のファイルが Max Allowed を超過 → **FAIL**:");
		for (const r of offenders) {
			out.push(`  - \`${r.file}\` — Current ${r.current} / Max ${r.max} (Diff +${r.diff})`);
		}
	}
}
out.push("");

out.push("## Acceptance criteria (582-570 親タスク)");
for (const a of acceptance) {
	out.push(`- [${a.pass ? "x" : " "}] ${a.label} — **${verdict(a.pass)}**`);
}
out.push("");

out.push(`**総合判定: ${verdict(overallPass)}**`);
out.push("");

writeFileSync(REPORT_PATH, out.join("\n"), "utf8");
console.log(`verify-report: wrote ${REPORT_PATH} — 総合判定 ${verdict(overallPass)}`);
